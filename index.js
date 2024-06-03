import fastify from "fastify";
import fastifyStatic from "@fastify/static";
import path from "node:path";
import stream from "node:stream";

// Initialze the Fastify server
const server = fastify({ logger: true });

// and register the static file plugin
server.register(fastifyStatic, {
  root: path.join(import.meta.dirname, "site"),
});

// This can be generated by: `(new TextEncoder()).encode('</html>')`
const ENCODED_CLOSING_HTML_TAG = new Uint8Array([
  60, 47, 104, 116, 109, 108, 62,
]);

// Set the injected code buffer, this could also be generated from something like fs.readFile('inject.html')
const INJECT_CODE = Buffer.from(`<script>alert('injected!')</script>`);

// Intercept the payload of fastify responses
// Tip: If you're using this in a larger fastify application, make sure to use encapsulation so this hook only runs for static file routes
server.addHook("onSend", function onSendHook(request, reply, payload, done) {
  // filter for html files only
  if (reply.getHeader("content-type").startsWith("text/html")) {
    // Modify content length
    const contentLength = reply.getHeader("content-length");
    reply.header("content-length", contentLength + INJECT_CODE.length);

    // Pipe the payload through a Transform stream
    const transformedPayload = payload.pipe(
      new stream.Transform({
        transform(chunk, encoding, callback) {
          if (encoding === "buffer") {
            // Find the closing `</html>` tag, and insert the custom script before it.
            const i = chunk.lastIndexOf(ENCODED_CLOSING_HTML_TAG);
            if (i > 0) {
              const injected = Buffer.alloc(chunk.length + INJECT_CODE.length);
              injected.fill(chunk.slice(0, i));
              injected.fill(INJECT_CODE, i);
              injected.fill(chunk.slice(i), i + INJECT_CODE.length);
              return callback(null, injected);
            }

            // Tip: A better way to inject HRML would be to use a HTML parsing library such as `node-html-parser`
            //      and then using DOM methods such as `htmlElement.insertAdjacentHTML("beforeend", /* inject code */);`.
            //      This is especially important if you are injecting user-provided code as this is a potential security
            //      vulnerability for your application.
          } else {
            console.warn(`Unexpected encoding type ${encoding}`);
          }
          return callback(null, chunk);
        },
      }),
    );

    return done(null, transformedPayload);
  }
  return done(null, payload);
});

server.listen({
  port: 3000,
  listenTextResolver: function listenTextResolver(address) {
    return `Server listening at ${address}`;
  },
});