import JSZip from 'jszip';

export class RefactorEngine {
    constructor() {
        this.parser = new DOMParser();
    }

    async process(htmlString, options = {}) {
        const doc = this.parser.parseFromString(htmlString, 'text/html');
        const zip = new JSZip();
        const logs = [];

        // Create directory structure
        const cssFolder = zip.folder("css");
        const jsFolder = zip.folder("js");

        // 1. Handle CSS
        if (options.splitCss) {
            const styles = doc.querySelectorAll('style');
            if (styles.length > 0) {
                styles.forEach((style, index) => {
                    const content = style.innerHTML.trim();
                    if (!content) return;

                    // Determine a name. If ID exists on style tag, use it.
                    const name = style.id ? style.id : `style-${index + 1}`;
                    const filename = `${name}.css`;

                    // Add to zip
                    cssFolder.file(filename, this.formatCss(content));

                    // Replace in DOM
                    const link = doc.createElement('link');
                    link.rel = 'stylesheet';
                    link.href = `css/${filename}`;
                    style.replaceWith(link);
                });
                logs.push(`Extracted ${styles.length} CSS blocks.`);
            }
        }

        // 2. Handle JS
        if (options.splitJs) {
            // Only select inline scripts that are not JSON-LD or modules that already have src
            const scripts = Array.from(doc.querySelectorAll('script:not([src])'))
                .filter(s => {
                    const type = s.getAttribute('type');
                    return !type || type === 'text/javascript' || type === 'module' || type === 'application/javascript';
                });

            if (scripts.length > 0) {
                scripts.forEach((script, index) => {
                    const content = script.innerHTML.trim();
                    if (!content) return;

                    const name = script.id ? script.id : `script-${index + 1}`;
                    const filename = `${name}.js`;

                    // Add to zip
                    jsFolder.file(filename, content);

                    // Replace in DOM
                    const newScript = doc.createElement('script');
                    newScript.src = `js/${filename}`;

                    // Copy relevant attributes
                    if (script.type) newScript.type = script.type;
                    if (script.defer) newScript.defer = true;
                    if (script.async) newScript.async = true;

                    script.replaceWith(newScript);
                });
                logs.push(`Extracted ${scripts.length} JS blocks.`);
            }
        }

        // 3. Dynamic HTML Generation (The "Advanced" part)
        if (options.dynamicLoader) {
            // Get the body innerHTML
            const bodyContent = doc.body.innerHTML;

            // Clean body in DOM
            doc.body.innerHTML = '<script src="js/layout-loader.js"></script>';

            // Create the generator script
            // escaping backticks is crucial here
            const safeContent = bodyContent.replace(/`/g, '\\`').replace(/\\$/g, '\\$');

            const loaderCode = `
document.addEventListener("DOMContentLoaded", () => {
    const layout = \`${safeContent}\`;
    // Create a range to properly execute scripts inserted via innerHTML
    const range = document.createRange();
    range.selectNode(document.body);
    const fragment = range.createContextualFragment(layout);
    document.body.appendChild(fragment);
    console.log("Layout loaded dynamically.");
});
            `;

            jsFolder.file("layout-loader.js", loaderCode);
            logs.push(`Converted HTML body to dynamic JS loader.`);
        }

        // 4. Finalize HTML
        const finalHtml = this.prettyPrintHtml(doc.documentElement.outerHTML);
        zip.file("index.html", `<!DOCTYPE html>\n${finalHtml}`);

        // Generate Blob
        const blob = await zip.generateAsync({ type: "blob" });
        return { blob, logs };
    }

    formatCss(css) {
        // Very basic indentation fix
        return css.split('}').join('}\n').trim();
    }

    prettyPrintHtml(html) {
        // Simple formatter to make the output readable
        let formatted = '';
        let indent = 0;
        html.split(/>\\s*</).forEach(node => {
            if (node.match(/^\\/\\w/)) indent -= 1;
            formatted += new Array(Math.max(0, indent * 4)).join(' ') + '<' + node + '>\n';
            if (node.match(/^<?\\w[^>]*[^\\/]$/) && !node.startsWith("input") && !node.startsWith("img") && !node.startsWith("br") && !node.startsWith("hr") && !node.startsWith("meta") && !node.startsWith("link")) {
                indent += 1;
            }
        });
        return formatted.substring(1, formatted.length - 2); // cleanup artifacts
    }
}