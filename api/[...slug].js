import handler from '../src/webServer.js';

export default async function(req, res) {
  // Pass the request to our central webServer logic
  return handler(req, res);
}
