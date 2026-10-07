# publish-audit-b.md — READ-ONLY publish audit (owner B)

**Target:** `https://github.com/anqp5002/learn_techGar.git` · **Scope:** audit only — không commit/push/config/auth thay-đổi. Metadata + đường-hướng publish an-toàn.

## 1. Local repo `D:\TechGar2`

| mục | kết-quả |
|---|---|
| remote | `origin = https://github.com/n23dccn155-gif/TechGAR_Parking.git` — **khác repo đích** |
| branch hiện-tại | `thai27_9` (nhánh cá-nhân, không phải default) |
| log đỉnh | `5f581311 chore: live calibration 27/9…` |
| working tree | 10 mục: 4 file backend modified + untracked `.analysis/`, `algo-web-v2/`, `algo-web/`, `experiment_test/reid_fix/`, `nul` |
| **`algo-web-v2/`** | **untracked** — chưa commit ở đâu trong repo này |

## 2. Authentication

- `gh auth status`: **chưa login host nào** → không verify được repo-settings qua API.
- `git ls-remote` (GIT_TERMINAL_PROMPT=0, không prompt): **exit 0, không error** → credential-helper (GCM) có quyền **đọc** repo đích ngầm. **Read-access KHÔNG chứng-minh write-scope** — chỉ biết chắc khi push thử; nếu push trả auth error → báo user đăng-nhập, không tự xử-lý.

## 2b. Phân-vai (LEAD review)

- Staging/commit/push = việc **C** (đang chuẩn-bị, HOLD trước push để LEAD review). **A/B không push.**
- B vai-tro: audit này + kiểm-độc-lập package của C (manifest/refs/hash) khi được giao.
- B không tự auth/login, không approve mục blocked.

## 3. Repo đích

| mục | kết-quả |
|---|---|
| tồn-tại | **có** (ls-remote không lỗi "Repository not found") |
| nội-dung | **rỗng hoàn-toàn tại thời-điểm audit** — 0 ref, không HEAD/branch |
| visibility | **chưa xác-minh** — trang repo 404 với viewer không-auth, nhưng 404 KHÔNG chứng-minh private (GitHub trả 404 cho cả repo-không-quyền-xem); không suy-diễn |
| default branch | chưa có — GitHub sẽ lấy nhánh push đầu-tiên làm default (thường `main`) |
| **→ push an-toàn** | **zero overwrite risk** *theo trạng-thái remote rỗng hiện-tại*; nếu có push khác xen vào trước, cần re-check `ls-remote` trước khi push — không cần force |

## 4. Payload `algo-web-v2/`

- Tổng: **84M / 780 files**.
- Site thực-chất: `js/` 656K + `css/` 16K + `index.html` 4K + ~80K docs (`SPEC.md`, `README.md`, style-guide, reviews) — **< 1MB**.
- `qa/` = **83M / 712 files** — screenshots + log QA artifacts (không phải nội-dung web). Quyết-định include/exclude thuộc LEAD.

## 5. Đường-hướng publish an-toàn (đề-xuất, chờ approve)

**Option A — standalone repo (khuyến-nghị):**
1. Copy `algo-web-v2/` ra staging (hoặc `git init` trong bản copy) — không đụng history TechGar2.
2. `git init` → add files (tùy-chọn `.gitignore` bỏ `qa/` 83M) → commit → `git remote add origin <target>` → `push -u origin main`.
3. Repo đích rỗng → push thường, **không** `--force`.

**Option B — orphan-branch trong TechGar2:** phức-tạp hơn, vẫn cần remote phụ — chỉ chọn nếu muốn giữ site trong cùng repo.

**Cần trước khi push (approval/blocker):**
- [ ] Approve: khởi-tạo repo staging + commit site + add remote + push (hành-động ghi, cần lệnh LEAD/user).
- [ ] Quyết: include hay exclude `qa/` 83M.
- [ ] Kiểm: file nhạy-cảm trong `algo-web-v2` (hiện audit thấy chỉ docs/js/css/index — không `.env`/secret; scan thêm trước commit nếu cần).
- [ ] Xác-nhận credential có write-scope khi push thử — nếu `git push` trả auth error → báo user đăng-nhập, **không tự xử-lý auth**.

**Không làm:** đổi `origin` của TechGar2, commit vào `thai27_9`, sửa git-config, `gh auth login` tự-động.
