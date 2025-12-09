import JSZip from 'jszip';

export class RefactorEngine {
    constructor() {
        this.parser = new DOMParser();
    }

    /**
     * Processes the input HTML and returns a result object.
     * @param {string} htmlString - Raw HTML
     * @param {Object} options - { splitCss: boolean, splitJs: boolean, dynamicLoader: boolean }
     */
    async process(htmlString, options = {}) {
        const logs = [];
        const fileManifest = []; // { path, size, type }
        const usedFilenames = new Set();
        
        const log = (msg) => {
            const entry = `[${new Date().toLocaleTimeString().split(' ')[0]}] ${msg}`;
            logs.push(entry);
        };

        log("Initializing Refactor Engine...");

        if (!htmlString || htmlString.trim().length === 0) {
            throw new Error("Input HTML is empty.");
        }

        // 1. Parse HTML
        // Note: DOMParser may wrap fragments in html/body automatically. 
        // We rely on this for consistency.
        const doc = this.parser.parseFromString(htmlString, 'text/html');
        if (!doc) throw new Error("DOMParser returned null.");
        
        log(`Parsed HTML document (${htmlString.length} chars).`);

        const zip = new JSZip();
        
        // Helper to safely add files to zip and manifest
        const addFile = (path, content) => {
            if (!content && content !== "") {
                log(`WARN: Attempted to add empty file at ${path}`);
                return;
            }
            zip.file(path, content);
            const size = new Blob([content]).size;
            fileManifest.push({ path, size: formatSize(size), rawSize: size, type: path.split('.').pop() });
            log(`+ Created ${path} (${formatSize(size)})`);
        };

        const getUniqueFilename = (folder, baseName, ext) => {
            // Clean basename
            let cleanBase = (baseName || 'file').replace(/[^a-zA-Z0-9-_]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
            if (!cleanBase) cleanBase = 'file';

            let name = `${cleanBase}.${ext}`;
            let fullPath = folder ? `${folder}/${name}` : name;
            let counter = 1;
            
            while (usedFilenames.has(fullPath)) {
                name = `${cleanBase}-${counter}.${ext}`;
                fullPath = folder ? `${folder}/${name}` : name;
                counter++;
            }
            usedFilenames.add(fullPath);
            return name;
        };

        // Folders
        const cssFolder = options.splitCss ? "css" : null;
        const jsFolder = options.splitJs ? "js" : null;

        // --- CSS EXTRACTION ---
        if (options.splitCss) {
            const styles = Array.from(doc.querySelectorAll('style'));
            log(`Found ${styles.length} <style> tags.`);
            
            let extractedCount = 0;
            styles.forEach((style, index) => {
                let content = style.innerHTML; // Use innerHTML to preserve anything weird inside, though textContent is safer for pure CSS.
                // Let's use textContent but decode HTML entities if DOMParser encoded them? 
                // Actually style.textContent is usually best for content.
                content = style.textContent;

                // Simple cleanup of <!-- --> comments which sometimes wrapper styles in old HTML
                content = content.replace(/^\s*<!--/g, '').replace(/-->\s*$/g, '').trim();

                if (!content) {
                    log(`Skipped empty <style> tag at index ${index}`);
                    return;
                }

                const id = style.id || `style-${index + 1}`;
                const filename = getUniqueFilename(cssFolder, id, 'css');
                const fullPath = `${cssFolder}/${filename}`;

                addFile(fullPath, content);

                // Create replacement link
                const link = doc.createElement('link');
                link.rel = 'stylesheet';
                link.href = fullPath;
                
                // Transfer attributes (media, etc.)
                Array.from(style.attributes).forEach(attr => {
                    if (attr.name !== 'id') { // Don't copy ID to avoid collision if we used it for filename
                        link.setAttribute(attr.name, attr.value);
                    }
                });

                style.replaceWith(link);
                extractedCount++;
            });
            if (extractedCount > 0) log(`Successfully extracted ${extractedCount} CSS files.`);
        }

        // --- JS EXTRACTION ---
        if (options.splitJs) {
            // Select scripts that are inline (no src) and are valid JS types
            const scripts = Array.from(doc.querySelectorAll('script:not([src])')).filter(s => {
                const type = s.getAttribute('type');
                // Allow standard JS types or no type
                return !type || ['text/javascript', 'module', 'application/javascript', 'text/ecmascript'].includes(type.toLowerCase());
            });

            log(`Found ${scripts.length} inline <script> tags.`);

            let extractedCount = 0;
            scripts.forEach((script, index) => {
                let content = script.textContent;
                
                // Cleanup wrapper comments
                content = content.replace(/^\s*<!--/g, '').replace(/-->\s*$/g, '').trim();

                if (!content) {
                    log(`Skipped empty <script> tag at index ${index}`);
                    return;
                }

                const id = script.id || `script-${index + 1}`;
                const filename = getUniqueFilename(jsFolder, id, 'js');
                const fullPath = `${jsFolder}/${filename}`;

                addFile(fullPath, content);

                const newScript = doc.createElement('script');
                newScript.src = fullPath;
                
                // Copy attributes (defer, async, type, etc.)
                Array.from(script.attributes).forEach(attr => {
                    if (attr.name !== 'id') {
                        newScript.setAttribute(attr.name, attr.value);
                    }
                });

                script.replaceWith(newScript);
                extractedCount++;
            });
            if (extractedCount > 0) log(`Successfully extracted ${extractedCount} JS files.`);
        }

        // --- DYNAMIC LOADER ---
        if (options.dynamicLoader) {
            log("Generating dynamic JS loader...");
            const body = doc.body;
            if (body) {
                const bodyHtml = body.innerHTML;
                // Escape for template literal
                // We need to be very careful here.
                const safeHtml = bodyHtml
                    .replace(/\\/g, '\\\\') // Escape backslashes first
                    .replace(/`/g, '\\`')   // Escape backticks
                    .replace(/\$\{/g, '\\${'); // Escape template interpolation

                const loaderCode = `
/**
 * Dynamic Layout Loader
 * Generated by Monolith Breaker
 */
document.addEventListener('DOMContentLoaded', () => {
    const appContainer = document.body;
    const layout = \`${safeHtml}\`;
    
    // Inject HTML securely-ish
    const range = document.createRange();
    range.selectNode(document.body);
    const fragment = range.createContextualFragment(layout);
    
    // Clear existing body (which might just be this script tag)
    // We append to ensure we don't wipe out scripts that ran already if any
    // But usually we want to replace the content.
    // Let's just append for safety or clear if it was empty.
    
    // Actually, for a "loader", we usually assume body is the target.
    // We will clear the body content that WAS there (which we extracted), 
    // but we need to keep THIS script running.
    
    document.body.appendChild(fragment);
    console.log("Layout loaded.");
});
`.trim();
                
                const loaderPath = `js/layout-loader.js`;
                addFile(loaderPath, loaderCode);

                // Nuke the body content in the HTML file
                doc.body.innerHTML = '';
                
                // Add the script to load it
                const loaderScript = doc.createElement('script');
                loaderScript.src = loaderPath;
                doc.body.appendChild(loaderScript);
                
                log("Converted <body> content to dynamic loader.");
            } else {
                log("Error: No <body> tag found to convert.");
            }
        }

        // --- FINALIZE HTML ---
        // We use outerHTML of documentElement to get <html>...</html>
        // But we need to prepend doctype
        let finalHtml = doc.documentElement.outerHTML;
        if (!finalHtml.toLowerCase().startsWith('<!doctype')) {
            finalHtml = `<!DOCTYPE html>\n` + finalHtml;
        }
        
        addFile('index.html', finalHtml);

        log("Generating ZIP blob...");
        const blob = await zip.generateAsync({ type: "blob" });
        log("Process complete.");

        return {
            zipBlob: blob,
            fileManifest,
            logs
        };
    }
}

function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}