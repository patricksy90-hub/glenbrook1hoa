/** Keep absolute classic navigation and screens with bottom actions in sync. */
export function classicTabBarHeight(platform: string, bottomInset: number): number {
  return platform === 'web' ? 84 : 56 + bottomInset;
}
