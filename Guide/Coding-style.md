# RtDt source coding conventions

These rules apply to source code and code examples, **not** to README or other prose documentation. They govern new code and changes to existing code; legacy files may still contain violations.

- Functions use **snake_case**.
- Constructors alone use **PascalCase**.
- Variables use **camelCase**.
- Constants use **UPPER_SNAKE_CASE**.
- New JavaScript filenames follow **`rtdt_snake_case.js`**.
- When renaming a definition, update every call site and reference consistently.
- Every source line that ends with an opening `{` must be followed immediately by a **blank line**, including functions, loops and conditionals.

For example:

~~~javascript
const MAX_FRAME_COUNT = 192;

function render_frame(frameIndex) {

    if (frameIndex >= MAX_FRAME_COUNT) {

        throw new Error('Frame is out of range');
    }

    return frameIndex;
}
~~~

Keep the Node CLI and WebApp thin. Raytracing, scene construction, job execution, animation, output transformation and validation rules belong in shared modules where practical; only filesystem, browser display, permissions and authentication should need platform adapters.

Run `npm test`, `npm run test:animation:full` and, for browser integration changes, `npm run test:browser` after relevant code changes. See [Architecture](Architecture.md).
