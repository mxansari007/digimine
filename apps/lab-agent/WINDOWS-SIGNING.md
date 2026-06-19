# Windows code signing — PlacementRanker Lab Agent

The Windows installer is **Authenticode-signed with a self-signed certificate**
(`build/PlacementRanker-CodeSigning.cer` is the public half). This is a
workaround for not having a paid CA-issued (OV/EV) certificate.

SHA-256 fingerprint:

```
92:E5:52:95:EB:C1:5C:91:FC:3B:21:A2:E1:A5:68:82:2F:EB:27:8A:FF:DC:4C:1D:B8:39:22:85:DD:CE:BA:0C
Subject: CN=PlacementRanker, O=PlacementRanker
```

## What it does / doesn't do

- ✅ The installer now carries a **publisher identity** ("PlacementRanker")
  instead of "Unknown Publisher" in the UAC / file-properties dialog.
- ✅ It is **RFC-3161 timestamped**, so the signature stays valid after the
  cert expires.
- ✅ On machines that **trust the certificate** (see below), the installer runs
  with **no warning at all** — ideal for an institute's managed lab machines.
- ❌ It does **not** clear Microsoft **SmartScreen** for the general public — a
  self-signed cert has no CA chain or download reputation, so an untrusted PC
  still shows *"Windows protected your PC → More info → Run anyway"*. Only a
  **paid OV/EV Authenticode certificate** removes that for everyone (drop the
  `.pfx` into the `WIN_CSC_LINK` / `WIN_CSC_KEY_PASSWORD` GitHub secrets and the
  CI signs with it instead — no workflow change needed).

## Trust it org-wide (institutes / managed machines)

Install the public cert into **Trusted Root Certification Authorities** and
**Trusted Publishers** on the target machines — then the agent installs and runs
with zero prompts.

Per machine (admin PowerShell):

```powershell
Import-Certificate -FilePath .\PlacementRanker-CodeSigning.cer -CertStoreLocation Cert:\LocalMachine\Root
Import-Certificate -FilePath .\PlacementRanker-CodeSigning.cer -CertStoreLocation Cert:\LocalMachine\TrustedPublisher
```

Fleet-wide: push the `.cer` to those two stores via **Group Policy**
(Computer Configuration → Windows Settings → Security Settings → Public Key
Policies) or Intune.

## Rotating / replacing the cert

The signing key lives only in the `WIN_CSC_LINK` (base64 `.pfx`) +
`WIN_CSC_KEY_PASSWORD` GitHub repo secrets — never in the repo. To replace it,
generate a new code-signing `.pfx`, update those two secrets, commit the new
public `.cer` here, and re-run the **Build Lab Agent** workflow.
