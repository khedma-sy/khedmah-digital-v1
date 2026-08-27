function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

interface KhedmahEmailTemplateInput {
  readonly preheader: string;
  readonly title: string;
  readonly message: string;
  readonly actionLabel: string;
  readonly actionUrl: string;
  readonly footnote: string;
}

export function renderKhedmahEmail(input: KhedmahEmailTemplateInput): string {
  const actionUrl = escapeHtml(input.actionUrl);
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(input.title)}</title></head>
<body style="margin:0;background:#fff9f0;color:#103452;font-family:Tahoma,Arial,sans-serif">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(input.preheader)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#fff9f0;padding:32px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#fff;border:1px solid #e8dfd4;border-radius:20px;box-shadow:0 16px 48px rgba(16,52,82,.10);overflow:hidden">
        <tr><td align="center" style="padding:30px 28px 18px">
          <div aria-label="خدمة" style="font-size:42px;line-height:1">☂</div>
          <div style="margin-top:5px;color:#ee7c37;font-size:32px;font-weight:800">خدمة</div>
          <div style="color:#647789;font-size:12px">تحت مظلة واحدة</div>
        </td></tr>
        <tr><td style="padding:10px 36px 34px;text-align:right">
          <h1 style="margin:0 0 16px;color:#103452;font-size:25px">${escapeHtml(input.title)}</h1>
          <p style="margin:0 0 24px;color:#425b70;font-size:16px;line-height:1.9">${escapeHtml(input.message)}</p>
          <p style="margin:0 0 26px;text-align:center">
            <a href="${actionUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;min-width:220px;padding:14px 24px;border-radius:10px;background:#155a91;color:#fff!important;text-decoration:none;font-size:16px;font-weight:700">${escapeHtml(input.actionLabel)}</a>
          </p>
          <p style="margin:0 0 8px;color:#647789;font-size:13px;line-height:1.7">إذا لم يعمل الزر، انسخ الرابط التالي وافتحه في المتصفح:</p>
          <p style="margin:0;padding:12px;border-radius:8px;background:#f7f9fa;direction:ltr;text-align:left;word-break:break-all;color:#16875f;font-size:12px"><a href="${actionUrl}" target="_blank" rel="noopener noreferrer" style="color:#16875f">${actionUrl}</a></p>
          <p style="margin:22px 0 0;color:#647789;font-size:13px;line-height:1.7">${escapeHtml(input.footnote)}</p>
        </td></tr>
        <tr><td style="padding:18px 28px;border-top:1px solid #e8dfd4;text-align:center;color:#7b8b98;font-size:12px">فريق خدمة — كل ما تحتاجه أقرب إليك</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
