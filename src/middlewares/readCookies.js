function decodeValue(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function parseCookieHeader(cookieHeader) {
  if (typeof cookieHeader !== 'string') {
    return {};
  }

  const cookies = {};

  for (const pair of cookieHeader.split(';')) {
    const separatorIndex = pair.indexOf('=');

    if (separatorIndex < 1) {
      continue;
    }

    const name = pair.slice(0, separatorIndex).trim();

    // A repeated name means two cookies of different scope reached us. The
    // first is the most specific one, so later duplicates are ignored.
    if (name === '' || Object.hasOwn(cookies, name)) {
      continue;
    }

    cookies[name] = decodeValue(pair.slice(separatorIndex + 1).trim());
  }

  return cookies;
}

function readCookies(request, response, next) {
  request.cookies = parseCookieHeader(request.headers.cookie);
  next();
}

module.exports = { readCookies, parseCookieHeader };
