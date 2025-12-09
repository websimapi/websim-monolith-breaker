import { RefactorEngine } from './refactor-engine.js';

const els = {
    input: document.getElementById('sourceCode'),
    fileInput: document.getElementById('fileInput'),
    processBtn: document.getElementById('processBtn'),
    downloadBtn: document.getElementById('downloadBtn'),
    fileMeta: document.getElementById('fileMeta'),
    resultsArea: document.getElementById('resultsArea'),
    fileTree: document.getElementById('fileTree'),
    logsArea: document.getElementById('logsArea'),
    opts: {
        css: document.getElementById('optCss'),
        js: document.getElementById('optJs'),
        dynamic: document.getElementById('optDynamic')
    }
};

const engine = new RefactorEngine();
let currentZipBlob = null;

// File Upload Handler
els.fileInput.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) {
        els.fileMeta.textContent = 'No file loaded';
        return;
    }

    const reader = new FileReader();
    reader.onload = (evt) => {
        const text = evt.target && evt.target.result ? String(evt.target.result) : '';
        els.input.value = text;
        els.input.scrollTop = 0;

        const sizeKb = (file.size / 1024).toFixed(1);
        const name = file.name || 'Unnamed file';
        
        els.fileMeta.textContent = `${name} (${sizeKb} KB)`;
        
        // Reset UI state
        els.resultsArea.classList.add('hidden');
        els.downloadBtn.disabled = true;
    };
    reader.readAsText(file);
});

// Process Button Handler
els.processBtn.addEventListener('click', async () => {
    const rawHtml = els.input.value;
    if (!rawHtml.trim()) {
        alert("Please enter some HTML code or upload a file first.");
        return;
    }

    // Reset UI
    els.resultsArea.classList.remove('hidden');
    els.fileTree.innerHTML = '<div style="color:var(--text-dim); padding:1rem; text-align:center">Processing...</div>';
    els.logsArea.textContent = 'Starting engine...';
    els.processBtn.disabled = true;
    els.downloadBtn.disabled = true;

    try {
        const options = {
            splitCss: els.opts.css.checked,
            splitJs: els.opts.js.checked,
            dynamicLoader: els.opts.dynamic.checked
        };

        // Artificial delay for UX so they see it working
        await new Promise(r => setTimeout(r, 500));

        const result = await engine.process(rawHtml, options);
        
        // Store blob for download
        currentZipBlob = result.zipBlob;
        
        // Render Output
        renderResults(result);

    } catch (err) {
        console.error(err);
        els.logsArea.textContent += `\nCRITICAL ERROR: ${err.message}`;
        els.fileTree.innerHTML = `<div style="color:#ff6b6b; padding:1rem">Processing Failed. See logs.</div>`;
    } finally {
        els.processBtn.disabled = false;
    }
});

els.downloadBtn.addEventListener('click', () => {
    if (currentZipBlob) {
        downloadBlob(currentZipBlob, "monolith-refactored.zip");
    }
});

function renderResults(result) {
    // 1. Logs
    els.logsArea.textContent = result.logs.join('\n');
    els.logsArea.scrollTop = els.logsArea.scrollHeight;

    // 2. File Tree
    els.fileTree.innerHTML = '';
    
    if (result.fileManifest.length === 0) {
        els.fileTree.innerHTML = '<div class="tree-item">No files generated.</div>';
        return;
    }

    result.fileManifest.forEach(file => {
        const item = document.createElement('div');
        item.className = 'tree-item';
        
        const nameSpan = document.createElement('span');
        nameSpan.innerHTML = `<span class="type">[${file.type.toUpperCase()}]</span> ${file.path}`;
        
        const sizeSpan = document.createElement('span');
        sizeSpan.className = 'size';
        sizeSpan.textContent = file.size;
        
        item.appendChild(nameSpan);
        item.appendChild(sizeSpan);
        els.fileTree.appendChild(item);
    });

    els.downloadBtn.disabled = false;
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Initial Sample
if (!els.input.value) {
    els.input.value = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Monolith Example</title>
    <style>
        /* Main Styles */
        body { font-family: sans-serif; background: #222; color: #fff; padding: 2rem; }
        .container { max-width: 600px; margin: 0 auto; border: 1px solid #444; padding: 20px; border-radius: 8px; }
    </style>
    <style id="buttons-css">
        button { background: tomato; color: white; border: 0; padding: 10px 20px; cursor: pointer; }
        button:hover { opacity: 0.9; }
    </style>
</head>
<body>
    <div class="container">
        <h1>Hello World</h1>
        <p>Click the button below to test JS extraction.</p>
        <button id="alertBtn">Click Me</button>
    </div>

    <script>
        console.log("App started");
        const btn = document.getElementById('alertBtn');
        btn.addEventListener('click', () => {
            alert("Javascript extracted successfully!");
        });
    </script>
</body>
</html>`;
}