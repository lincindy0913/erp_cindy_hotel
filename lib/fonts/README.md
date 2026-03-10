# 傳票 PDF 中文字型

傳票列印（`/payment-voucher`、廠商月度傳票）需在此目錄放置 **Noto Sans TC** 字型，PDF 中文才不會亂碼。

## 方式一：自動下載（建議）

在專案根目錄執行：

```bash
npm run download-pdf-font
```

會從 Google Fonts 下載字型並存成 `NotoSansTC-Regular.ttf`。

## 方式二：手動放置

1. 前往 [Google Fonts – Noto Sans TC](https://fonts.google.com/noto/specimen/Noto+Sans+TC)
2. 點「Download family」取得 ZIP
3. 解壓後將 **NotoSansTC-Regular.ttf**（或任一 `.ttf`）複製到此目錄 `lib/fonts/`

若使用其他支援繁體中文的 TTF（如思源黑體、文泉驛），也可放入此目錄，系統會自動使用第一個找到的 `.ttf`。
