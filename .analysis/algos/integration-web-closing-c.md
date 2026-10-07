# Integration pack — closing report (C)

- **Review nguồn**: `.analysis/algos/integration-web-quality-review-b.md` (B, trên snapshot hash `cb443779b97555fe`)
- **Pack sau fix**: `algo-web/packs/integration.js` — size **289652 B**, sha256(16) **`4092aa839ac25e8d`**
- **Verify**: `node ../.analysis/algos/_audit_integration.mjs` từ `algo-web/` → **3389/3389 PASS**
  (276 frames · `emptyState=0` · `noMetrics=0` · `<3frames=0` · `drawThrow=0` · 70 param runs · invariant-shape fails=0)
- **Full QA**: `node qa/smoke.js` @2026-10-04T08:48Z — contract 236/236 · file 547/547 checks/956 frames · HTTP 117/117+236/236 · paramChanges 130/130 · 0 console/page/request errors.

## Outcome từng finding

| # | Finding | Outcome (explicit) |
|---|---|---|
| P1 | `replay-timestamp-pairing` fault=missing-col chỉ 2 frames | Thêm frame `load-input` (inventory csv/video/fault) trước `load-header` → **3 frames** không padding; audit `<3frames=0`. |
| M1 | `RuntimeError` EOF bị gán `ValueError` | `errors` đổi thành `[{cls,msg}]`: ValueError = header/idx/ts (validation); RuntimeError = EOF-dư-frame/video-kết-thúc-sớm. `result.error` = `errors[0].cls`; `result.at` = msg (không còn strip prefix). Check `error type` so `result.error` trực tiếp. |
| M2 | `claim_s_new` vs `claim_s-new` → check claim bị skip | Key result + reference normalize `replace(/-/g,'_')` → `claim_s_new`/`claim_s_old` khớp fixture; loop check duyệt **theo expected keys** — result thiếu key = fail thay vì skip. |
| M3 | `expected.note` không có `result.note` | Emit `result.note` khi action_id mutate sau khi bị evict khỏi cap-32 (track `evicted{}` trong cap-delete). Edge: `'u-1 trôi cap 32 → replay mutate lại'` ✓ + check `note`. Bonus: emit `verdicts_head`/`verdicts_tail` projections thật (audit đòi `actual === result[k]`). |
| M4 | `ttl_s` dead param | `s-old` thành session **legacy** (gỡ `qrExpiresAt` → fallback `createdAt+ttl_s`; giá trị default 120s ≡ fixture cũ → zero behavior change ở defaults). Verified: `ttl_s=30` → s-old expiry 10:00:30 < now → loại khỏi waiting (`["s-mid","s-new"]` vs `["s-old","s-mid","s-new"]`). Descriptions 2 scenario ghi rõ s-old là legacy. |
| M5 | 8 typed I/O `description` rỗng | Điền đủ (previous_positions · vehicle{…} · session_id · pass\|SelectionUnavailable · session merge · file atomic · set_parked\|set_exit\|wait · normalized config). |
| L1 | `state:{}` replay rows + atomic done | Replay: row frames `{timings,idx}` / pair+done `{pairs,errors,due_s}` / eof `{eofError,pairs}`. Atomic done: `{file_keys,tmp_orphan,load_result}` + metrics. Audit `emptyState=0`. |
| L3 | expected keys thiếu coverage | Bổ sung: `layout_count` (snapshot-v2) · `sid_of_gid5_rt1` (entry-session) · `rejected` (class-map) + `rejected_all` (measured-path — tính từ guard fail chung của mọi rejected pair: edge `recency > 1.0s` ✓) · `skipped` (`allSkipped` aggregate các poll — parking-episode) · gate-config whole-map `post`/`ctrl` · QR claim duyệt theo expected. Audit coverage loop pass toàn bộ. |
| L4 | `buildTrace(id,{})` không merge defaults | Wrap mọi lesson `buildTrace` trước `registerPack`: `Object.assign(defParams(L,scenId), params\|\|{})` — defaults→scenario.defaultParams→caller wins. Verified node: 46/46 `buildTrace(id,{})` ≡ `buildTrace(id,effectiveDefaults)`; explicit override thắng (`ttl_s=30` đổi waiting). |
| L6 | fault expected không independent | `expectedFor` reference của replay = mirror đầy đủ pipeline (load→idx/ts→pair→EOF→pacing) + inject fault **bên trong reference riêng** — không fallback fixture khi params đổi. Divergence đỏ ở nhánh fault = phân loại thật (ValueError/RuntimeError), không phải invariant error. |
| — | `metrics ≥1` (36 frame done) | 18 done frames có summary metrics (pairs/errors/cameras/sessions…) — audit `noMetrics=0`. |

## Nguyên tắc đã giữ

- Không sửa fixture để khớp trace; mọi `scenario.expected` giữ nguyên —
  `trace.expected ≡ scenario.expected` ở defaults (audit line 98 pass 46/46).
- Không hardcode PASS; mọi check `chk()` so actual-vs-expected thật.
- Không pad frames — `load-input` là stage input/validation thật của pipeline.
- Không đụng `backend/`, `frontend/` production.
- Không cài dep; audit/smoke dùng infra sẵn có.

## Files thay đổi

`algo-web/packs/integration.js` (toàn bộ findings), `algo-web/qa/smoke.js` (scope label),
`algo-web/QA.md`, `algo-web/qa-results.json`, `algo-web/qa/smoke-results.json`,
`algo-web/qa/screenshots/` (refresh).
