import { RefactorEngine } from './refactor-engine.js';

const els = {
    input: document.getElementById('sourceCode'),
    fileInput: document.getElementById('fileInput'),
    processBtn: document.getElementById('processBtn'),
    status: document.getElementById('statusLog'),
    opts: {
        css: document.getElementById('optCss'),
        js: document.getElementById('optJs'),
        dynamic: document.getElementById('optDynamic')
    }
};

const engine = new RefactorEngine();

// File Upload Handler
els.fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        els.input.value = e.target.result;
        els.status.textContent = `Loaded ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
    };
    reader.readAsText(file);
});

// Process Button Handler
els.processBtn.addEventListener('click', async () => {
    const rawHtml = els.input.value;
    if (!rawHtml.trim()) {
        els.status.textContent = "Error: Input is empty.";
        els.status.style.color = "#ff6b6b";
        return;
    }

    els.status.style.color = "var(--text-dim)";
    els.status.textContent = "Processing...";
    els.processBtn.disabled = true;

    try {
        const options = {
            splitCss: els.opts.css.checked,
            splitJs: els.opts.js.checked,
            dynamicLoader: els.opts.dynamic.checked
        };

        const { blob, logs } = await engine.process(rawHtml, options);

        // Update Log
        const successMsg = logs.length > 0 ? logs.join(" | ") : "Processed with no extractions needed.";
        els.status.textContent = "Success! " + successMsg;
        els.status.style.color = "var(--success)";

        // Download
        downloadBlob(blob, "refactored-project.zip");

    } catch (err) {
        console.error(err);
        els.status.textContent = "Error during processing. Check console.";
        els.status.style.color = "#ff6b6b";
    } finally {
        els.processBtn.disabled = false;
    }
});

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Initial default text for demo purposes if empty
if (!els.input.value) {
    els.input.value = `<!DOCTYPE html>
<html>
<head>
    <title>Sample Monolith</title>
    <style>
        body { background: #1a1a1a; color: #f0f0f0; font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; }
        h1 { color: #61dafb; }
    </style>
    <style id="extra-styles">
        .card { background: #333; padding: 2rem; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); text-align: center; }
        button { background: #61dafb; border: none; padding: 10px 20px; border-radius: 4px; font-weight: bold; cursor: pointer; margin-top: 1rem; }
        button:hover { background: #4fa8d1; }
    </style>
</head>
<body>
    <div class="card">
        <h1>Monolith Test</h1>
        <p>This is a sample layout.</p>
        <button id="btn">Interact</button>
        <div id="output" style="margin-top: 1rem; height: 20px;"></div>
    </div>

    <script>
        // This script will be extracted
        const btn = document.getElementById('btn');
        const out = document.getElementById('output');
        const message = "Dynamic JS Working!";
        
        btn.addEventListener('click', () => {
            out.textContent = \`\${message} - Timestamp: \${new Date().toLocaleTimeString()}\`;
        });
    </script>
</body>
</html>`;
}