import { XMLHttpRequest } from '../src/XMLHttpRequest';
import { createServer } from 'http';
import getPort from 'get-port';

test('headers', async (done) => {
  const port = await getPort();
  const server = createServer((req, res) => {
    // Test setRequestHeader
    expect('Foobar').toEqual(req.headers['x-test']);
    // Test non-conforming allowed header
    expect('node-XMLHttpRequest-test').toEqual(req.headers['user-agent']);
    // Test header set with blacklist disabled

    const body = 'Hello World';
    res.writeHead(200, {
      'Content-Type': 'text/plain',
      'Content-Length': Buffer.byteLength(body),
      // Set cookie headers to see if they're correctly suppressed
      // Actual values don't matter
      'Set-Cookie': 'foo=bar',
      'Set-Cookie2': 'bar=baz',
      Date: 'Thu, 30 Aug 2012 18:17:53 GMT',
      Connection: 'close',
    });
    res.write('Hello World');
    res.end();

    server.close();
  }).listen(port);

  const xhr = new XMLHttpRequest();
  xhr.onreadystatechange = function() {
    if (this.readyState == 4) {
      // Test getAllResponseHeaders()
      const headers =
        'content-type: text/plain\r\ncontent-length: 11\r\ndate: Thu, 30 Aug 2012 18:17:53 GMT\r\nconnection: close';

      expect(headers).toEqual(this.getAllResponseHeaders());

      // Test case insensitivity
      expect('text/plain').toEqual(this.getResponseHeader('Content-Type'));
      expect('text/plain').toEqual(this.getResponseHeader('Content-type'));
      expect('text/plain').toEqual(this.getResponseHeader('content-Type'));
      expect('text/plain').toEqual(this.getResponseHeader('content-type'));

      // Test aborted getAllResponseHeaders
      this.abort();

      expect('').toEqual(this.getAllResponseHeaders());
      expect(null).toEqual(this.getResponseHeader('Connection'));
      done();
    }
  };

  expect(null).toEqual(xhr.getResponseHeader('Content-Type'));
  xhr.open('GET', `http://localhost:${port}/`);
  // Valid header
  xhr.setRequestHeader('X-Test', 'Foobar');
  xhr.setRequestHeader('X-Test2', 'Foobar1');
  xhr.setRequestHeader('X-Test2', 'Foobar2');

  // Allowed header outside of specs
  xhr.setRequestHeader('user-agent', 'node-XMLHttpRequest-test');
  // Test getRequestHeader

  expect('Foobar').toEqual(xhr.getRequestHeader('X-Test'));
  expect('Foobar').toEqual(xhr.getRequestHeader('x-tEST'));
  expect('Foobar1, Foobar2').toEqual(xhr.getRequestHeader('x-test2'));

  // Test invalid header
  expect('').toEqual(xhr.getRequestHeader('Content-Length'));

  // Test allowing all headers
  xhr.setDisableHeaderCheck(true);
  xhr.setRequestHeader('Referer', 'http://github.com');

  xhr.send(undefined);
});
