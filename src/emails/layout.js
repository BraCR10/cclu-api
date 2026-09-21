// Every value in a message comes from a person: a business name someone typed
// when registering, a reason an administrator wrote. None of it may become
// markup.
const ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

const COLORS = {
  brand: '#1F3A5F',
  brandDark: '#162A45',
  accent: '#C9A227',
  text: '#222222',
  muted: '#5B6B7C',
  border: '#E1E6EB',
  surface: '#F5F7FA',
  buttonText: '#FFFFFF',
};

const FONT_STACK = "Segoe UI, Roboto, Helvetica, Arial, sans-serif";

const SIGNATURE = 'Cámara de Comercio, Turismo, Industria y Afines del Cantón de La Unión';

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ESCAPES[character]);
}

/**
 * Bloques aceptados por layout():
 *  - string                          -> párrafo ya escapado por la plantilla
 *  - { type: 'text', html }          -> párrafo
 *  - { type: 'button', href, label, url } -> botón + dirección textual
 */
function renderBlock(block) {
  if (typeof block === 'string') {
    return `<p style="margin:0 0 16px 0;font-family:${FONT_STACK};font-size:16px;line-height:24px;color:${COLORS.text};">${block}</p>`;
  }

  if (block && block.type === 'text') {
    return `<p style="margin:0 0 16px 0;font-family:${FONT_STACK};font-size:16px;line-height:24px;color:${COLORS.text};">${block.html}</p>`;
  }

  if (block && block.type === 'button') {
    const safeHref = escapeHtml(block.href);
    const safeUrl = escapeHtml(block.url || block.href);
    const safeLabel = escapeHtml(block.label);
    return `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 20px 0;">
        <tr>
          <td align="center" bgcolor="${COLORS.brand}" style="border-radius:6px;">
            <a href="${safeHref}"
               style="display:inline-block;padding:14px 28px;font-family:${FONT_STACK};font-size:16px;font-weight:600;line-height:20px;color:${COLORS.buttonText};text-decoration:none;border-radius:6px;">
              ${safeLabel}
            </a>
          </td>
        </tr>
      </table>
      <p style="margin:0 0 20px 0;font-family:${FONT_STACK};font-size:13px;line-height:20px;color:${COLORS.muted};">
        Si el botón no funciona, copie esta dirección en su navegador:<br>
        <span style="color:${COLORS.brand};word-break:break-all;">${safeUrl}</span>
      </p>
    `;
  }

  return '';
}


// Paragraphs arrive already escaped, because each template decides which parts
// of its own text are markup it wrote and which are values it received.

function layout(heading, blocks) {
  const body = blocks.map(renderBlock).join('');

  // Outer table + inline styles: Gmail, Outlook y móvil sin CSS externo.
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(heading)}</title>
</head>
<body style="margin:0;padding:0;background-color:${COLORS.surface};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${COLORS.surface};padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background-color:#FFFFFF;border:1px solid ${COLORS.border};border-radius:8px;overflow:hidden;">

          <!-- Cabecera con marca y nombre completo -->
          <tr>
            <td bgcolor="${COLORS.brand}" style="padding:24px 28px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="font-family:${FONT_STACK};font-size:18px;font-weight:700;color:#FFFFFF;letter-spacing:0.5px;">
                    CCLU
                  </td>
                </tr>
                <tr>
                  <td style="padding-top:4px;font-family:${FONT_STACK};font-size:13px;line-height:18px;color:#D9E2EC;">
                    ${escapeHtml(SIGNATURE)}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr><td bgcolor="${COLORS.accent}" style="height:4px;line-height:4px;font-size:0;">&nbsp;</td></tr>

          <!-- Cuerpo -->
          <tr>
            <td style="padding:28px;">
              <h1 style="margin:0 0 20px 0;font-family:${FONT_STACK};font-size:22px;line-height:30px;font-weight:700;color:${COLORS.brand};">
                ${escapeHtml(heading)}
              </h1>
              ${body}
            </td>
          </tr>

          <!-- Pie con nombre y contacto -->
          <tr>
            <td style="padding:20px 28px 24px 28px;border-top:1px solid ${COLORS.border};background-color:${COLORS.surface};">
              <p style="margin:0 0 6px 0;font-family:${FONT_STACK};font-size:13px;line-height:20px;color:${COLORS.muted};">
                ${escapeHtml(SIGNATURE)}
              </p>
              <p style="margin:0;font-family:${FONT_STACK};font-size:13px;line-height:20px;color:${COLORS.muted};">
                Contacto: <a href="mailto:info@cclu.cr" style="color:${COLORS.brand};text-decoration:underline;">info@cclu.cr</a>
                &nbsp;·&nbsp;
                <a href="https://cclu.cr" style="color:${COLORS.brand};text-decoration:underline;">cclu.cr</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}


module.exports = { layout, escapeHtml, SIGNATURE };
