const express = require('express');
const bodyParser = require('body-parser');
const { exec } = require('child_process');
const tmp = require('tmp');
const fs = require('fs-extra');
const path = require('path');
const cors = require('cors');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Platform-specific configurations
const isWindows = os.platform() === 'win32';
const isMac = os.platform() === 'darwin';
const isLinux = os.platform() === 'linux';

// Determine LaTeX executable path based on platform
let pdflatexPath;
if (isWindows) {
  pdflatexPath = '"C:\\Program Files\\MiKTeX\\miktex\\bin\\x64\\pdflatex.exe"';
} else if (isMac) {
  pdflatexPath = '/Library/TeX/texbin/pdflatex';
} else {
  // Linux - assume installed via texlive
  pdflatexPath = '/usr/bin/pdflatex';
}

// Config based on environment
const corsOrigins =
  NODE_ENV === 'production'
    ? process.env.ALLOWED_ORIGINS?.split(',') || ['https://yourdomain.com']
    : ['http://localhost:3000'];

// Configure middleware
app.use(cors({
  origin: corsOrigins,
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key']
}));
app.use(bodyParser.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Simple API key middleware for security
const API_KEY = process.env.API_KEY;
const apiKeyMiddleware = (req, res, next) => {
  if (!API_KEY) return next();
  const requestApiKey = req.headers['x-api-key'];
  if (requestApiKey !== API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

// Create a temporary directory for outputs
const outputDir = path.join(__dirname, 'temp');
fs.ensureDirSync(outputDir);

// Clean up temp files older than 1 hour
const cleanupTempFiles = () => {
  const oneHourAgo = new Date();
  oneHourAgo.setHours(oneHourAgo.getHours() - 1);
  fs.readdir(outputDir, (err, files) => {
    if (err) return console.error('Error reading temp directory:', err);
    files.forEach(file => {
      const filePath = path.join(outputDir, file);
      fs.stat(filePath, (statErr, stats) => {
        if (statErr) return console.error(`Error stating file ${file}:`, statErr);
        if (stats.isFile() && stats.mtime < oneHourAgo) {
          fs.unlink(filePath, unlinkErr => {
            if (unlinkErr) console.error(`Error removing file ${file}:`, unlinkErr);
          });
        }
      });
    });
  });
};
setInterval(cleanupTempFiles, 60 * 60 * 1000);

// Health check endpoint
app.get('/health', (req, res) => {
  const healthInfo = {
    status: 'ok',
    message: 'LaTeX rendering service is running',
    environment: NODE_ENV,
    platform: os.platform(),
    latexPath: pdflatexPath,
    timestamp: new Date().toISOString()
  };
  res.json(healthInfo);
});

// Helper function to escape RegExp special characters in a string
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Full document rendering endpoint
app.post('/render', apiKeyMiddleware, async (req, res) => {
  console.log(`[${new Date().toISOString()}] Received rendering request`);
  const { latex, format = 'pdf', images = [] } = req.body;
  if (!latex) {
    return res.status(400).json({ error: 'LaTeX content is required' });
  }
  try {
    // Create temporary directory for the job
    const tmpDir = tmp.dirSync({ unsafeCleanup: true });
    const inputFile = path.join(tmpDir.name, 'input.tex');
    console.log(`Created temporary directory: ${tmpDir.name}`);
    console.log(`LaTeX content length: ${latex.length}`);
    console.log(`Received ${images.length} images`);
    // Create an images subfolder
    const imagesDir = path.join(tmpDir.name, 'images');
    fs.mkdirSync(imagesDir, { recursive: true });
    // Mapping between original image names and sanitized filenames
    const imageNameMapping = {};
    if (images && images.length > 0) {
      console.log(`Processing ${images.length} images`);
      for (const image of images) {
        try {
          if (image.name && image.data) {
            const originalName = path.basename(image.name);
            const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
            imageNameMapping[originalName] = safeName;
            const mainPath = path.join(tmpDir.name, safeName);
            const imagePath = path.join(imagesDir, safeName);
            let imageData;
            if (typeof image.data === 'string' && image.data.startsWith('data:')) {
              const matches = image.data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
              if (matches && matches.length === 3) {
                imageData = Buffer.from(matches[2], 'base64');
              } else {
                throw new Error("Invalid data URL format");
              }
            } else if (typeof image.data === 'string') {
              imageData = Buffer.from(image.data, 'base64');
            } else {
              throw new Error("Image data must be a string");
            }
            fs.writeFileSync(mainPath, imageData);
            fs.writeFileSync(imagePath, imageData);
            console.log(`Saved image ${safeName} (${imageData.length} bytes)`);
          } else {
            console.log(`Missing name or data for image`);
          }
        } catch (imgError) {
          console.error(`Error processing image ${image?.name}:`, imgError);
        }
      }
    }
    // Inject graphicspath and add graphicx package if needed
    let processedLaTeX = latex;
    if (!processedLaTeX.includes('\\graphicspath')) {
      const graphicsPathCmd = '\\graphicspath{{./}{./images/}{.}}\n';
      if (processedLaTeX.includes('\\begin{document}')) {
        processedLaTeX = processedLaTeX.replace(/(\\begin\{document\})/, `${graphicsPathCmd}$1`);
      } else {
        processedLaTeX = graphicsPathCmd + processedLaTeX;
      }
      console.log("Added graphicspath command to LaTeX");
    }
    if (!processedLaTeX.includes('\\usepackage{graphicx}') &&
        !processedLaTeX.includes('\\usepackage[pdftex]{graphicx}')) {
      if (processedLaTeX.includes('\\documentclass')) {
        processedLaTeX = processedLaTeX.replace(/(\\documentclass.*?\})/, '$1\n\\usepackage[pdftex]{graphicx}');
        console.log("Added graphicx package to LaTeX");
      }
    }
    // Replace image references inside \includegraphics commands with sanitized filenames
    processedLaTeX = processedLaTeX.replace(/\\includegraphics(\[.*?\])?\{([^}]+)\}/g, (match, options, filename) => {
      const trimmed = filename.trim();
      if (imageNameMapping[trimmed]) {
        console.log(`Replaced image reference '${trimmed}' with '${imageNameMapping[trimmed]}'`);
        return `\\includegraphics${options || ''}{${imageNameMapping[trimmed]}}`;
      }
      return match;
    });
    fs.writeFileSync(inputFile, processedLaTeX);
    console.log(`LaTeX content written to ${inputFile}`);
    const pdfLatexCmd = `${pdflatexPath} -interaction=nonstopmode -halt-on-error -output-directory="${tmpDir.name}" "${inputFile}"`;
    console.log("Running LaTeX command:", pdfLatexCmd);
    // Run pdflatex twice to resolve references
    exec(pdfLatexCmd, async (error, stdout, stderr) => {
      console.log("First LaTeX run completed");
      console.log("Running LaTeX command a second time");
      exec(pdfLatexCmd, async (error2, stdout2, stderr2) => {
        if (error2) {
          console.error(`Error executing pdflatex:`, error2.message);
          const logPath = path.join(tmpDir.name, 'input.log');
          if (fs.existsSync(logPath)) {
            const logContent = fs.readFileSync(logPath, 'utf8');
            const debugLogPath = path.join(outputDir, `latex-log-${Date.now()}.txt`);
            fs.writeFileSync(debugLogPath, logContent);
            console.log(`Saved LaTeX log to ${debugLogPath}`);
          }
          let errorMessage = 'LaTeX compilation failed';
          const errorLog = fs.existsSync(path.join(tmpDir.name, 'input.log')) 
            ? fs.readFileSync(path.join(tmpDir.name, 'input.log'), 'utf8')
            : stderr2;
          const errorMatch = errorLog.match(/!(.*?)(?:\n|$)/);
          if (errorMatch) {
            errorMessage = errorMatch[1].trim();
          }
          tmpDir.removeCallback();
          // Return only the simplified error message to the client
          return res.status(500).json({ error: errorMessage });
        }
        const pdfPath = path.join(tmpDir.name, 'input.pdf');
        if (format === 'pdf') {
          if (fs.existsSync(pdfPath)) {
            const pdfData = fs.readFileSync(pdfPath);
            const base64Pdf = pdfData.toString('base64');
            console.log(`Successfully generated PDF (${pdfData.length} bytes)`);
            tmpDir.removeCallback();
            return res.json({
              format: 'pdf',
              data: base64Pdf
            });
          } else {
            console.error('PDF file not found at expected path');
            console.log('Files in temp directory after compilation:');
            listFilesRecursively(tmpDir.name);
            tmpDir.removeCallback();
            return res.status(500).json({ error: 'PDF generation failed - output file not found' });
          }
        }
        tmpDir.removeCallback();
        return res.status(400).json({ error: 'Unsupported output format' });
      });
    });
  } catch (error) {
    console.error(`Server error:`, error);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Helper function to list all files in a directory recursively (for debugging)
function listFilesRecursively(dir) {
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stats = fs.statSync(filePath);
    if (stats.isDirectory()) {
      console.log(`[DIR] ${filePath}`);
      listFilesRecursively(filePath);
    } else {
      console.log(`[FILE] ${filePath} (${stats.size} bytes)`);
    }
  });
}

// Math formula rendering endpoint
app.post('/render-math', apiKeyMiddleware, async (req, res) => {
  const { latex, displayMode = false } = req.body;
  if (!latex) {
    return res.status(400).json({ error: 'LaTeX math content is required' });
  }
  try {
    const tmpDir = tmp.dirSync({ unsafeCleanup: true });
    const inputFile = path.join(tmpDir.name, 'input.tex');
    const fullLatex = `
\\documentclass{article}
\\usepackage{amsmath,amssymb,amsfonts}
\\usepackage[active,tightpage]{preview}
\\usepackage{xcolor}
\\begin{document}
\\begin{preview}
${displayMode ? `\\begin{align*}${latex}\\end{align*}` : `$${latex}$`}
\\end{preview}
\\end{document}
`;
    fs.writeFileSync(inputFile, fullLatex);
    const pdfLatexCmd = `${pdflatexPath} -interaction=nonstopmode -halt-on-error -output-directory="${tmpDir.name}" "${inputFile}"`;
    console.log("Running LaTeX math command:", pdfLatexCmd);
    exec(pdfLatexCmd, async (error, stdout, stderr) => {
      if (error) {
        const errorLog = fs.existsSync(path.join(tmpDir.name, 'input.log'))
          ? fs.readFileSync(path.join(tmpDir.name, 'input.log'), 'utf8')
          : stderr;
        let errorMessage = 'LaTeX compilation failed';
        const errorMatch = errorLog.match(/!(.*?)(?:\n|$)/);
        if (errorMatch) {
          errorMessage = errorMatch[1].trim();
        }
        tmpDir.removeCallback();
        return res.status(500).json({ error: errorMessage });
      }
      const pdfPath = path.join(tmpDir.name, 'input.pdf');
      const outputPng = path.join(tmpDir.name, 'output.png');
      const convertCmd = isWindows
        ? `magick convert -density 300 -background white -alpha remove "${pdfPath}" "${outputPng}"`
        : `convert -density 300 -background white -alpha remove "${pdfPath}" "${outputPng}"`;
      console.log("Running ImageMagick math command:", convertCmd);
      exec(convertCmd, (imgError, imgStdout, imgStderr) => {
        if (imgError) {
          console.error(`Error converting PDF to image: ${imgError.message}`);
          tmpDir.removeCallback();
          return res.status(500).json({ error: 'Image conversion failed' });
        }
        if (fs.existsSync(outputPng)) {
          const imgData = fs.readFileSync(outputPng);
          const base64Img = imgData.toString('base64');
          tmpDir.removeCallback();
          return res.json({
            format: 'png',
            data: base64Img
          });
        } else {
          tmpDir.removeCallback();
          return res.status(500).json({ error: 'Image conversion failed' });
        }
      });
    });
  } catch (error) {
    console.error(`Server error: ${error.message}`);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Start the server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`LaTeX rendering server running on port ${PORT}`);
  console.log(`Environment: ${NODE_ENV}`);
  console.log(`Detected platform: ${os.platform()}`);
  console.log(`Using LaTeX executable: ${pdflatexPath}`);
  console.log(`CORS origins: ${corsOrigins.join(', ')}`);
});
