# Founder packet originals

The launch and development packet as delivered on 17 November 2026, preserved byte-for-byte. `SHA256SUMS` records each file's hash; `pnpm validate` re-checks them.

| File | Purpose (from START_HERE.txt) |
|---|---|
| [START_HERE.txt](START_HERE.txt) | Cover note: reading order, status and planning baseline |
| [Seafood_Confidential_Launch_Packet.pdf](Seafood_Confidential_Launch_Packet.pdf) | The 24-page founder plan |
| [Seafood_Confidential_Launch_Packet.docx](Seafood_Confidential_Launch_Packet.docx) | Editable version to update when the founders settle decisions |
| [Seafood_Confidential_Sprint_Workbook.xlsx](Seafood_Confidential_Sprint_Workbook.xlsx) | Sprint, costs, six-week editorial calendar and proposed founder decisions |

The development kit that accompanied these files is unpacked at the repository root. The packet's Markdown source is [docs/LAUNCH_PACKET.md](../docs/LAUNCH_PACKET.md); the PDF and DOCX carry the same text (evidence EV-0002).

**Provenance.** Delivered as `Seafood_Confidential_Launch_Packet.zip` (sha256 `4871128f91e61a109d1eb9ed039a8677910184af275f22cd177c2828fd934b04`) in commit `2eb9723`. Recover it with:

```bash
git show 2eb9723:Seafood_Confidential_Launch_Packet.zip > Seafood_Confidential_Launch_Packet.zip
```

**Editing.** Change the DOCX when the founders settle decisions (START_HERE.txt). Then update this directory's `SHA256SUMS` (`sha256sum START_HERE.txt Seafood_Confidential_* > SHA256SUMS`) and note the change in the changelog and dev log. The workbook mirrors repository JSON that is now the engineering working record (docs/KIT_AUDIT.md).
