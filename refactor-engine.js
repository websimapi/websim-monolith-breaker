import JSZip from 'jszip';

export class RefactorEngine {
    constructor() {
        this.parser = new DOMParser();
    }

    async process(htmlString, options = {}) {
        const doc = this.parser.parseFromString(htmlString, 'text/html');
        const zip = new JSZip();
        const logs = [];

        // Helper to ensure unique filenames
        const usedFilenames = new Set();
        const getUniqueFilename = (folder, baseName, ext) => {
            let name = `${baseName}.${ext}`;
            let counter = 1;
            while (usedFilenames.has(`${folder}/${name}`)) {
                name = `${baseName}-${counter}.${ext}`;
                counter++;
            }
            usedFilenames.add(`${folder}/${name}`);
            return name;
        };

        const cssFolder = zip.folder("css");
        const jsFolder = zip.folder("js");

        // 1. Handle CSS
        if (options.splitCss) {
            const styles = Array.from(doc.querySelectorAll('style'));
            if (styles.length > 0) {
                styles.forEach((style) => {
                    // Get raw content and clean up potential HTML comments (legacy hack)
                    let content = style.textContent;
                    if (!content) return;
                    
                    // Remove <!-- and --> wrappers if present
                    content = content.replace(/^\s*<!--/, '').replace(/-->\s*$/, '').trim();
                    if (!content) return;

                    const baseName = style.id || `style`;
                    const filename = getUniqueFilename('css', baseName, 'css');

                    // Add to zip (raw content)
                    cssFolder.file(filename, content);

                    // Replace in DOM
                    const link = doc.createElement('link');
                    link.rel = 'stylesheet';
                    link.href = `css/${filename}`;
                    
                    // Copy attributes from style to link (e.g. media="print")
                    Array.from(style.attributes).forEach(attr => {
                        // Skip ID if we used it, or keep it. Keeping it is safer for JS hooks.
                        // But we generated a filename from it. Let's keep all attributes.
                        link.setAttribute(attr.name, attr.value);
                    });

                    style.replaceWith(link);
                });
                logs.push(`Extracted ${styles.length} CSS blocks.`);
            }
        }

        // 2. Handle JS
        if (options.splitJs) {
            const scripts = Array.from(doc.querySelectorAll('script:not([src])'))
                .filter(s => {
                    const type = s.getAttribute('type');
                    return !type || type === 'text/javascript' || type === 'module' || type === 'application/javascript';
                });

            if (scripts.length > 0) {
                scripts.forEach((script) => {
                    let content = script.textContent;
                    if (!content) return;

                    // Remove <!-- and --> wrappers if present
                    content = content.replace(/^\s*<!--/, '').replace(/-->\s*$/, '').trim();
                    if (!content) return;

                    const baseName = script.id || `script`;
                    const filename = getUniqueFilename('js', baseName, 'js');

                    // Add to zip
                    jsFolder.file(filename, content);

                    // Replace in DOM
                    const newScript = doc.createElement('script');
                    newScript.src = `js/${filename}`;

                    // Copy all attributes
                    Array.from(script.attributes).forEach(attr => {
                        newScript.setAttribute(attr.name, attr.value);
                    });
                    
                    // Ensure type is copied or defaulted if needed, though loop above handles generic copying
                    // Explicitly handling properties that might not map 1:1 via setAttribute if necessary
                    // But for script tags, setAttribute is usually sufficient.

                    script.replaceWith(newScript);
                });
                logs.push(`Extracted ${scripts.length} JS blocks.`);
            }
        }

        // 3. Dynamic HTML Generation
        if (options.dynamicLoader) {
            const bodyContent = doc.body.innerHTML;

            // Escape sensitive characters for the JS template string
            // 1. Backslashes
            // 2. Backticks
            // 3. Template interpolation start ${
            const safeContent = bodyContent
                .replace(/\\/g, '\\\\') 
                .replace(/`/g, '\\`')
                .replace(/\$\{/g, '\\${');

            const loaderFilename = "layout-loader.js";
            const loaderCode = `
(function() {
    const layout = \`${safeContent}\`;
    
    function loadLayout() {
        const range = document.createRange();
        range.selectNode(document.body);
        const fragment = range.createContextualFragment(layout);
        document.body.appendChild(fragment);
        console.log("Layout loaded dynamically.");
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', loadLayout);
    } else {
        loadLayout();
    }
})();
            `.trim();

            jsFolder.file(loaderFilename, loaderCode);

            // Replace body with loader script
            doc.body.innerHTML = '';
            const loaderScript = doc.createElement('script');
            loaderScript.src = `js/${loaderFilename}`;
            doc.body.appendChild(loaderScript);

            logs.push(`Converted body to dynamic JS loader.`);
        }

        // 4. Finalize HTML - Use outerHTML to preserve structure, avoid aggressive pretty printing which breaks some layouts
        const finalHtml = `<!DOCTYPE html>\n${doc.documentElement.outerHTML}`;
        zip.file("index.html", finalHtml);

        const blob = await zip.generateAsync({ type: "blob" });
        return { blob, logs };
    }
}