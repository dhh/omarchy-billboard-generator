import { domainToASCII } from 'node:url';

export function normalizeSuffix(value) {
  const input = value.replace(/^\./, '').replace(/\.$/, '');
  if (!input || /[\s/:@?#\\<>\u0000-\u001f]/u.test(input)) throw Error('Invalid domain suffix. Supply domain labels such as .dev, .co.uk or .中国, without a URL or path.');
  // A reserved alphabetic tail prevents URL host parsing from interpreting a
  // numeric suffix as an IPv4 address while still applying IDNA conversion.
  const host = domainToASCII(input + '.invalid');
  const ascii = host.endsWith('.invalid') ? host.slice(0, -8) : '';
  if (!ascii || ascii.split('.').some(label => !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label))) throw Error('Invalid domain suffix: labels must contain letters, digits or interior hyphens.');
  return '.' + ascii.toUpperCase();
}
