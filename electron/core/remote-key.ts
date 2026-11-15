// Public half of the Ed25519 key that signs remote/config.json (docs/release.md). The private half lives only on the
// site owner's computer (~/.codexbuddy/remote-config-ed25519.pem, scripts/gen-signing-key.mjs) and never in the repo.
// SHA-256 fingerprint (DER): 97:c1:16:ff:d0:91:ff:b8:64:54:72:a7:8c:8d:26:8b:dc:9b:d1:83:2d:96:c3:02:54:3e:33:fa:37:1e:6d:f6
export const REMOTE_CONFIG_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEA2iH0YW1/r6eRcd5cA30YGOJEer+Ypqj3FdI3uXT/d8M=
-----END PUBLIC KEY-----
`;
