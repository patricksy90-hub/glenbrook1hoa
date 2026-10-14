# Dependency advisory review

Reviewed September 2, 2026 after refreshing the pnpm lockfile under the
workspace's package-firewall and 24-hour release-age policies.

## Remediated parent chains

| Direct parent | Vulnerable transitive package(s) | Resolution |
| --- | --- | --- |
| `@expo/cli` (mobile) | `brace-expansion`, `postcss`, `js-yaml`, `browserslist` | Kept Expo SDK 54 and upgraded its CLI to the latest SDK-54 release. Patched transitive versions are pinned where SDK 54's ranges are too narrow. |
| `@babel/core` (mobile and web tooling) | `browserslist` | Upgraded within Babel 7. |
| `vite` (web) | `vite`, `postcss`, `nanoid`, `yaml` | Upgraded within Vite 7 and pinned patched compatible transitive releases. |
| `recharts` (web) | `lodash` | Kept Recharts 2 and pinned patched Lodash 4. |
| `xlsx` (web) | direct prototype-pollution and ReDoS advisories | Replaced the unpatched package with `read-excel-file`; the AR import still reads only the required workbook rows. The unused root copy was removed. |
| `drizzle-orm` (API) | SQL identifier injection | Upgraded within Drizzle ORM 0.45. |
| `nodemailer` (API) | header injection, file-read, and SSRF advisories | Upgraded to the first patched major line; the application uses the unchanged `createTransport` and `sendMail` APIs. |
| `@google-cloud/storage` (API) | `fast-xml-parser` | Upgraded within Storage 7 and pinned the patched parser version accepted by its dependency range. |
| `express` / `express-rate-limit` (API) | `qs`, `body-parser`, `ip-address` | Kept Express 5, upgraded the limiter within major 8, and pinned patched compatible transitive releases. |
| `orval` (code generation) | `markdown-it`, `linkify-it`, `fast-uri`, `js-yaml` | Kept the repository's exact Orval generator version to avoid unrelated generated-client churn, while pinning patched compatible transitive parsers. |
| `drizzle-kit` (database tooling) | obsolete `@esbuild-kit` loader and old `esbuild` | Reused the workspace's existing loader replacement with maintained `tsx`. |

## Remaining advisories

### `image-size@1.2.1` through Expo Metro — high, unpatched

- **Path:** `@expo/cli@54.0.27` → `@expo/metro@54.2.0` →
  `metro@0.83.3` → `image-size@1.2.1`.
- **Reachability:** Build tooling only. It is not included in the native
  application runtime. The reported infinite loops require parsing attacker
  controlled ICNS, JXL, or HEIF image metadata; the release build processes
  repository-controlled app assets and does not accept those formats from
  users.
- **Mitigation:** Keep mobile release assets review-controlled, reject
  ICNS/JXL/HEIF additions, and retain the exact latest Expo SDK-54 CLI pin.
  Recheck this chain when moving to a newer Expo SDK. npm currently reports no
  patched `image-size` release for these advisories.

### `uuid@7/9` through Expo and Google tooling — moderate

- **Paths:** Expo config's `xcode` helper uses UUID 7; Google Storage's
  `gaxios` helper uses UUID 9.
- **Reachability:** The advisory concerns the optional caller-supplied buffer
  argument for UUID v3/v5/v6. The application never calls those transitive UUID
  APIs. The Expo path is build-time only, and the Google request path does not
  expose a UUID buffer argument to API clients.
- **Mitigation:** Do not force UUID 11 across incompatible major ranges because
  that can break Expo's release tooling. Continue upgrading the direct parents
  in their supported lines and re-run the audit on each dependency refresh.

### `esbuild@0.27.7` through Orval — low

- **Path:** `orval@8.5.3` → `@orval/core` → `esbuild@0.27.7`.
- **Reachability:** Development-time API client generation only. The advisory
  requires a user to visit a malicious website while an affected esbuild
  development server is running. This project invokes Orval as a one-shot
  generator against the repository-controlled OpenAPI file and does not expose
  an esbuild development server through that path.
- **Mitigation:** Keep Orval pinned so generated API output stays reproducible,
  run codegen only against reviewed local specifications, and upgrade the
  generator in a dedicated change that can review its generated-source diff.