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
        els.status.textContent = logs.join(" ") || "Processed with no extractions needed.";
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
        body { background: #333; color: white; }
        h1 { font-family: sans-serif; }
    </style>
    <style id="buttons-css">
        button { padding: 10px; cursor: pointer; }
    </style>
</head>
<body>
    <h1>Hello World</h1>
    <button onclick="sayHi()">Click Me</button>
    <script>
        function sayHi() { 
            alert('Hello from extracted JS!'); 
        }
    </script>
</body>
</html>`;
}