import React, { useEffect, useRef, useState } from 'react';
import { Modal, View, Text, StyleSheet, Pressable, ScrollView, TextInput, ActivityIndicator, Platform, useWindowDimensions } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import { sendPaymentStepUpEmail, submitDuesPayment, verifyPaymentStepUp, type CashDuesDeclaration } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { centsToString, isTrustedCheckoutUrl, paymentTotalCents, remainingCents, toCents, type DueLike, type AdvancePeriod } from '@/lib/duesPayment';

type Method = 'email_otp' | 'totp' | 'backup_code';
const METHODS: { key: Method; label: string }[] = [
  { key: 'email_otp', label: 'Email code' },
  { key: 'totp', label: 'Authenticator' },
  { key: 'backup_code', label: 'Backup code' },
];

export interface PendingCheckout {
  url: string;
  ids: number[];
  baseline: Record<number, number>;
}

export async function openCheckout(url: string): Promise<boolean> {
  if (!isTrustedCheckoutUrl(url)) return false;
  try {
    if (Platform.OS === 'web') {
      const popup = window.open(url, '_blank');
      if (popup) popup.opener = null;
      return !!popup;
    }
    await WebBrowser.openBrowserAsync(url);
    return true;
  } catch {
    return false;
  }
}

interface Props {
  visible: boolean;
  dues: (DueLike & { period: string })[];
  advances: AdvancePeriod[];
  onlineEnabled: boolean;
  sessionKey?: number;
  feePerPeriod: number;
  onClose: () => void;
  onCheckoutCreated: (p: PendingCheckout, opened: boolean) => void;
  onCashDeclared: (result: CashDuesDeclaration) => void;
}

export function DuesPaymentSheet({ visible, dues, advances, onlineEnabled, sessionKey, feePerPeriod, onClose, onCheckoutCreated, onCashDeclared }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [method, setMethod] = useState<Method>('email_otp');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'paymongo'>('cash');
  const [code, setCode] = useState('');
  const [verified, setVerified] = useState(false);
  const [emailSentTo, setEmailSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | 'send' | 'verify' | 'pay'>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const generation = useRef(0);
  const onlineAllowed = onlineEnabled && advances.length === 0;

  // Fresh MFA is required every time review opens.
  useEffect(() => {
    generation.current++;
    setMethod('email_otp');
    setPaymentMethod(onlineAllowed ? 'paymongo' : 'cash');
    setCode('');
    setVerified(false);
    setEmailSentTo(null);
    if (!inFlight.current) setBusy(null);
    setError(null);
  }, [visible, sessionKey, onlineAllowed]);
  useEffect(() => () => { generation.current++; }, []);

  const effectiveMethod = onlineAllowed ? paymentMethod : 'cash';
  const feeCents = effectiveMethod === 'paymongo' ? toCents(feePerPeriod) : 0;
  const total = paymentTotalCents(dues, advances, effectiveMethod, feePerPeriod);
  const count = dues.length + advances.length;

  const run = async (kind: 'send' | 'verify' | 'pay', fn: (alive: () => boolean) => Promise<void>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(kind);
    setError(null);
    const epoch = generation.current;
    const alive = () => generation.current === epoch;
    try {
      await fn(alive);
    } catch (e) {
      if (alive()) {
        if (kind === 'pay') setVerified(false);
        const status = (e as { status?: number })?.status;
        setError(kind === 'pay'
          ? status === 409 ? 'Monthly dues changed. Close this sheet, refresh the advance periods, and review the updated amount before submitting.'
            : status === 403 ? 'Please verify again. Your verification may have expired or the selection is no longer allowed.'
            : effectiveMethod === 'cash' ? 'The cash submission could not be confirmed. Check with HOA staff before declaring the same periods again.'
              : 'Payment was not confirmed. Refresh dues and verify again before retrying.'
          : kind === 'send' ? 'Could not send the code. Try again.' : 'That code was not accepted.');
      }
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  };

  const send = () => run('send', async (alive) => {
    const r = await sendPaymentStepUpEmail();
    if (!r.sent) throw new Error('not sent');
    if (alive()) setEmailSentTo(r.email);
  });

  const verify = () => run('verify', async (alive) => {
    const r = await verifyPaymentStepUp({ code: code.trim(), method });
    if (!r.ok) throw new Error('rejected');
    if (alive()) { setVerified(true); setCode(''); }
  });

  const pay = () => {
    if (inFlight.current || !verified || !count) return;
    const popup = Platform.OS === 'web' && effectiveMethod === 'paymongo' ? window.open('', '_blank') : null;
    if (popup) popup.opener = null;
    run('pay', async (alive) => {
      try {
        if (effectiveMethod === 'cash') {
          const res = await submitDuesPayment({
            paymentMethod: 'cash',
            paymentDate: new Date().toISOString().slice(0, 10),
            items: [
              ...dues.map(d => ({ dueId: d.id })),
              ...advances.map(p => ({ advancePeriod: p.periodKey, advanceAmount: p.amount })),
            ],
          });
          if (!('ok' in res) || !res.ok) throw new Error('Cash declaration not accepted');
          if (alive()) onCashDeclared(res);
          return;
        }
        const res = await submitDuesPayment({ items: dues.map((d) => ({ dueId: d.id })), paymentMethod: 'paymongo', expectedTotalCents: total });
        if (!('checkoutUrl' in res)) throw new Error('Checkout unavailable');
        const url = res.checkoutUrl;
        if (!isTrustedCheckoutUrl(url)) throw new Error('untrusted');
        if (!alive()) { popup?.close(); return; }
        const baseline: Record<number, number> = {};
        dues.forEach((d) => { baseline[d.id] = remainingCents(d); });
        let opened = false;
        if (popup) { popup.location.href = url; opened = true; } else opened = await openCheckout(url);
        if (alive()) onCheckoutCreated({ url, ids: dues.map((d) => d.id), baseline }, opened);
      } catch (e) {
        popup?.close();
        throw e;
      }
    });
  };

  const field = [styles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.card, borderRadius: colors.radius }];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={() => { if (!inFlight.current) onClose(); }}>
      <View style={styles.backdrop}>
        <KeyboardAvoidingView behavior="padding" style={{ width: '100%' }}>
          <View style={[styles.sheet, { backgroundColor: colors.background, paddingBottom: insets.bottom + 16 }]} testID="pay-sheet">
            <View style={styles.titleRow}>
              <Text style={[styles.title, { color: colors.foreground }]}>Review payment</Text>
              <Pressable onPress={onClose} disabled={busy !== null} testID="pay-close" style={styles.closeBtn} accessibilityLabel="Close">
                <Text style={[styles.link, { color: colors.primary }]}>Close</Text>
              </Pressable>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: Math.min(520, Math.max(160, height - insets.top - insets.bottom - 190)) }}>
              <Text style={[styles.small, { color: colors.mutedForeground }]}>Choose how to pay</Text>
              <View style={styles.methods}>
                <Pressable testID="pay-option-cash" accessibilityRole="radio" accessibilityState={{ checked: effectiveMethod === 'cash' }} disabled={busy !== null} onPress={() => setPaymentMethod('cash')} style={[styles.methodBtn, { borderColor: effectiveMethod === 'cash' ? colors.primary : colors.border, backgroundColor: effectiveMethod === 'cash' ? colors.secondary : colors.card, borderRadius: colors.radius }]}>
                  <Text style={[styles.methodText, { color: colors.foreground }]}>Cash at HOA office</Text>
                </Pressable>
                {onlineAllowed && <Pressable testID="pay-option-online" accessibilityRole="radio" accessibilityState={{ checked: effectiveMethod === 'paymongo' }} disabled={busy !== null} onPress={() => setPaymentMethod('paymongo')} style={[styles.methodBtn, { borderColor: effectiveMethod === 'paymongo' ? colors.primary : colors.border, backgroundColor: effectiveMethod === 'paymongo' ? colors.secondary : colors.card, borderRadius: colors.radius }]}>
                  <Text style={[styles.methodText, { color: colors.foreground }]}>Online · PayMongo</Text>
                </Pressable>}
              </View>
              <Text style={[styles.small, { color: colors.mutedForeground }]}>
                {effectiveMethod === 'cash' ? 'A cash declaration is not proof of payment. Bring the exact amount to the HOA office; dues remain open until staff verifies your payment.' : 'Secure checkout opens with PayMongo. Dues remain unpaid until the server confirms payment.'}
                {advances.length ? ' Advance periods can only be declared as cash.' : ''}
              </Text>
              {dues.map((d) => (
                <View key={d.id} style={[styles.line, { borderBottomColor: colors.border }]} testID={`pay-line-${d.id}`}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.lineTitle, { color: colors.foreground }]}>{d.period}</Text>
                    {effectiveMethod === 'paymongo' && <Text style={[styles.small, { color: colors.mutedForeground }]}>Convenience fee {centsToString(feeCents)}</Text>}
                  </View>
                  <Text style={[styles.lineAmt, { color: colors.foreground }]}>{centsToString(remainingCents(d))}</Text>
                </View>
              ))}
              {advances.map(p => <View key={p.periodKey} testID={`pay-advance-${p.periodKey}`} style={[styles.line, { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
                <View style={{ flex: 1 }}><Text style={[styles.lineTitle, { color: colors.foreground }]}>{p.period}</Text><Text style={[styles.small, { color: colors.mutedForeground }]}>Advance · cash only</Text></View>
                <Text style={[styles.lineAmt, { color: colors.foreground }]}>{centsToString(toCents(p.amount))}</Text>
              </View>)}
              <View style={styles.totalRow}>
                <Text style={[styles.lineTitle, { color: colors.foreground }]}>Total ({count} {count === 1 ? 'period' : 'periods'})</Text>
                <Text style={[styles.total, { color: colors.foreground }]} testID="pay-total">{centsToString(total)}</Text>
              </View>

              <Text style={[styles.section, { color: colors.foreground }]}>Confirm it is you</Text>
              {verified ? (
                <View style={[styles.ok, { backgroundColor: colors.secondary, borderRadius: colors.radius }]} testID="pay-verified">
                  <Text style={[styles.lineTitle, { color: colors.secondaryForeground }]}>Identity confirmed</Text>
                </View>
              ) : (
                <View>
                  <View style={styles.methods}>
                    {METHODS.map((m) => (
                      <Pressable
                        key={m.key}
                        testID={`pay-method-${m.key}`}
                        disabled={busy !== null}
                        onPress={() => { setMethod(m.key); setCode(''); setError(null); }}
                        style={[styles.methodBtn, { borderColor: colors.border, borderRadius: colors.radius }, method === m.key && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                      >
                        <Text style={[styles.methodText, { color: method === m.key ? colors.primaryForeground : colors.foreground }]}>{m.label}</Text>
                      </Pressable>
                    ))}
                  </View>
                  {method === 'email_otp' && (
                    <Pressable onPress={send} disabled={busy !== null} testID="pay-send-email" style={[styles.secondaryBtn, { borderColor: colors.primary, borderRadius: colors.radius }]}>
                      <Text style={[styles.btnText, { color: colors.primary }]}>{busy === 'send' ? 'Sending' : emailSentTo ? 'Resend email code' : 'Email me a code'}</Text>
                    </Pressable>
                  )}
                  {method === 'email_otp' && emailSentTo ? <Text style={[styles.small, { color: colors.mutedForeground, marginTop: 6 }]}>Code sent to {emailSentTo}</Text> : null}
                  <TextInput
                    testID="pay-code-input"
                    value={code}
                    onChangeText={setCode}
                    placeholder={method === 'backup_code' ? 'Backup code' : '6-digit code'}
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType={method === 'backup_code' ? 'default' : 'number-pad'}
                    autoCapitalize="none"
                    autoCorrect={false}
                    maxLength={32}
                    style={field}
                  />
                  <Pressable onPress={verify} disabled={busy !== null || code.trim().length === 0} testID="pay-verify" style={[styles.primaryBtn, { backgroundColor: colors.primary, borderRadius: colors.radius, opacity: busy !== null || !code.trim() ? 0.5 : 1 }]}>
                    <Text style={[styles.btnText, { color: colors.primaryForeground }]}>{busy === 'verify' ? 'Verifying' : 'Verify code'}</Text>
                  </Pressable>
                </View>
              )}
              {error ? <Text style={[styles.err, { color: colors.destructive }]} testID="pay-error">{error}</Text> : null}
            </ScrollView>
            <Pressable onPress={pay} disabled={!verified || busy !== null || !count} testID="pay-submit" style={[styles.primaryBtn, { backgroundColor: colors.primary, borderRadius: colors.radius, opacity: !verified || busy !== null || !count ? 0.5 : 1, marginTop: 12 }]}>
              {busy === 'pay' ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={[styles.btnText, { color: colors.primaryForeground }]}>{effectiveMethod === 'cash' ? `Declare cash · ${centsToString(total)}` : `Pay ${centsToString(total)} with PayMongo`}</Text>}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(20,25,20,0.5)' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  title: { fontFamily: 'Outfit_700Bold', fontSize: 22 },
  closeBtn: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'flex-end' },
  link: { fontFamily: 'DMSans_700Bold', fontSize: 16 },
  line: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, gap: 12 },
  lineTitle: { fontFamily: 'DMSans_700Bold', fontSize: 16 },
  lineAmt: { fontFamily: 'Outfit_700Bold', fontSize: 17 },
  small: { fontFamily: 'DMSans_400Regular', fontSize: 14, lineHeight: 20 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, gap: 8 },
  total: { fontFamily: 'Outfit_700Bold', fontSize: 22 },
  section: { fontFamily: 'Outfit_600SemiBold', fontSize: 17, marginBottom: 8, marginTop: 4 },
  ok: { padding: 14 },
  methods: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  methodBtn: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, minHeight: 44, justifyContent: 'center' },
  methodText: { fontFamily: 'DMSans_600SemiBold', fontSize: 14 },
  input: { borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 18, fontFamily: 'DMSans_600SemiBold', marginTop: 10, minHeight: 48 },
  primaryBtn: { minHeight: 50, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, marginTop: 10 },
  secondaryBtn: { minHeight: 48, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  btnText: { fontFamily: 'DMSans_700Bold', fontSize: 16, textAlign: 'center' },
  err: { fontFamily: 'DMSans_600SemiBold', fontSize: 14, marginTop: 10 },
});
