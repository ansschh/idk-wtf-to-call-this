// utils/LaTeXTreeProcessor.ts
export interface LaTeXNode {
    type: string;
    name?: string;
    content: string;
    children: LaTeXNode[];
    parent: LaTeXNode | null;
    startPos: number;
    endPos: number;
    lineStart?: number;
    lineEnd?: number;
    meta?: Record<string, any>;
  }
  
  export class LaTeXTreeProcessor {
    private content: string = '';
    
    constructor() {}
    
    public parseDocument(content: string): LaTeXNode {
      this.content = content;
      const root: LaTeXNode = {
        type: 'root',
        content: content,
        children: [],
        parent: null,
        startPos: 0,
        endPos: content.length
      };
      
      // Parse document structure
      this.parseDocumentStructure(root); 
      
      // Add line numbers
      this.addLineNumbers(root, content);
      
      return root;
    }
    
    private parseDocumentStructure(root: LaTeXNode): void {
      // **FIX: Declare and calculate docStartIndex FIRST**
      const docStartIndex = this.content.indexOf('\\begin{document}');

      // Parse preamble (everything before \begin{document})
      // Now the 'if' condition can safely use docStartIndex
      if (docStartIndex !== -1) {
        const preamble: LaTeXNode = {
          type: 'preamble',
          content: this.content.substring(0, docStartIndex + '\\begin{document}'.length),
          children: [],
          parent: root,
          startPos: 0,
          endPos: docStartIndex + '\\begin{document}'.length
        };
        root.children.push(preamble);

        // Parse document class
        this.parseDocumentClass(preamble);

        // Parse packages
        this.parsePackages(preamble);

         // Parse environments within the preamble content
         this.parseEnvironments(preamble, preamble.content, preamble.startPos); // Adjusted call

      } else {
          // Handle case where \begin{document} is missing - maybe parse whole content as body?
          console.warn("Could not find '\\begin{document}'. Parsing entire content as body/preamble.");
          // Optionally, parse environments in the whole root content if no document structure found
          this.parseEnvironments(root, root.content, root.startPos);
      }

      // Parse document body
      // bodyStartIndex calculation now correctly uses docStartIndex
      const bodyStartIndex = docStartIndex !== -1 ? docStartIndex + '\\begin{document}'.length : (docStartIndex !== -1 ? 0 : -1); // Avoid parsing body if no \begin{document} found
      const docEndIndex = this.content.indexOf('\\end{document}');
      const bodyEndIndex = docEndIndex !== -1 ? docEndIndex : this.content.length;

      // Only create and parse body node if \begin{document} was found
      if (bodyStartIndex !== -1 && bodyStartIndex < bodyEndIndex) {
            const bodyNode: LaTeXNode = {
                type: 'body',
                content: this.content.substring(bodyStartIndex, bodyEndIndex),
                children: [],
                parent: root,
                startPos: bodyStartIndex,
                endPos: bodyEndIndex
            };
            root.children.push(bodyNode);

            // Parse sections within the body
            this.parseSections(bodyNode); // This will internally call parseEnvironments for each section's content

            // Optionally, parse any content in the body *not* captured by sections (if parseSections doesn't handle it)
            // This might be redundant if parseSections calls parseParagraphs correctly.
            // this.parseEnvironments(bodyNode, bodyNode.content, bodyNode.startPos); // Check if needed based on parseSections impl.

      } else if (docStartIndex !== -1) {
           console.warn("Found '\\begin{document}' but no content found before '\\end{document}' or end of file.");
      }


      // Parse content *after* \end{document} if it exists? (Optional, usually ignored in LaTeX)
      if (docEndIndex !== -1 && docEndIndex < this.content.length) {
          const postambleContent = this.content.substring(docEndIndex + '\\end{document}'.length);
          if (postambleContent.trim().length > 0) {
              const postambleNode: LaTeXNode = {
                  type: 'postamble',
                  content: postambleContent,
                  children: [],
                  parent: root,
                  startPos: docEndIndex + '\\end{document}'.length,
                  endPos: this.content.length
              };
              root.children.push(postambleNode);
              // Optionally parse environments/content here too
              this.parseEnvironments(postambleNode, postambleNode.content, postambleNode.startPos);
          }
      }

       // Final sort of root's direct children might be needed if preamble/body/postamble order matters strictly
       root.children.sort((a, b) => a.startPos - b.startPos);
    }


    
    private parseDocumentClass(parent: LaTeXNode): void {
      const docClassRegex = /\\documentclass(\[.*?\])?\{(.*?)\}/;
      const match = parent.content.match(docClassRegex);
      
      if (match) {
        const startPos = parent.startPos + match.index!;
        const endPos = startPos + match[0].length;
        
        const docClass: LaTeXNode = {
          type: 'documentclass',
          name: match[2],
          content: match[0],
          children: [],
          parent: parent,
          startPos,
          endPos,
          meta: {
            options: match[1] ? match[1].slice(1, -1) : ''
          }
        };
        
        parent.children.push(docClass);
      }
    }
    
    private parsePackages(parent: LaTeXNode): void {
      const packageRegex = /\\usepackage(\[.*?\])?\{(.*?)\}/g;
      
      let match;
      while ((match = packageRegex.exec(parent.content)) !== null) {
        const startPos = parent.startPos + match.index;
        const endPos = startPos + match[0].length;
        
        const pkg: LaTeXNode = {
          type: 'package',
          name: match[2],
          content: match[0],
          children: [],
          parent: parent,
          startPos,
          endPos,
          meta: {
            options: match[1] ? match[1].slice(1, -1) : ''
          }
        };
        
        parent.children.push(pkg);
      }
    }
    
    private parseSections(parent: LaTeXNode): void {
      const sectionTypes = ['section', 'subsection', 'subsubsection', 'paragraph', 'subparagraph'];
      const sectionNodesMap: Map<number, LaTeXNode> = new Map();

      // Find all section commands and store them with their start position
      for (const sectionType of sectionTypes) {
          const regex = new RegExp(`\\\\${sectionType}\\*?\\{.*?\\}`, 'g'); // Simpler regex just to find start
          let match;
          while ((match = regex.exec(parent.content)) !== null) {
              const startPos = parent.startPos + match.index;
              const endPos = startPos + match[0].length; // End of the command itself
               const titleMatch = match[0].match(/\{(.*?)\}/);
               const title = titleMatch ? titleMatch[1] : '';

              const sectionNode: LaTeXNode = {
                  type: sectionType,
                  name: title,
                  content: '', // Will be filled later
                  children: [],
                  parent: parent,
                  startPos: startPos, // Start of the command
                  endPos: endPos, // Will be updated to end of section content
                   meta: { title: title, isStarred: match[0].includes('*') }
              };
               if (!sectionNodesMap.has(startPos)) { // Avoid duplicates if regex overlaps
                  sectionNodesMap.set(startPos, sectionNode);
               }
          }
      }

      const sortedSections = Array.from(sectionNodesMap.entries())
                                .sort((a, b) => a[0] - b[0])
                                .map(entry => entry[1]);

      let lastPos = parent.startPos;

       // Process content *before* the first section
       if (sortedSections.length === 0 || sortedSections[0].startPos > parent.startPos) {
           const initialContent = this.content.substring(lastPos, sortedSections.length > 0 ? sortedSections[0].startPos : parent.endPos);
           // Parse environments in the content before the first section command
           this.parseEnvironments(parent, initialContent, lastPos);
       }


      // Process each section
      for (let i = 0; i < sortedSections.length; i++) {
          const currentSection = sortedSections[i];
          const nextSectionStart = (i + 1 < sortedSections.length) ? sortedSections[i+1].startPos : parent.endPos;

          // The actual content of the section starts *after* the command
          const sectionContentStart = currentSection.endPos; // End of the command line
          currentSection.endPos = nextSectionStart; // Update endPos to where the next section starts (or parent ends)
          currentSection.content = this.content.substring(sectionContentStart, currentSection.endPos);

          parent.children.push(currentSection);

          // Recursively parse environments *within* this section's content
          // Pass the section node, its inner content, and the content's starting offset
          this.parseEnvironments(currentSection, currentSection.content, sectionContentStart);

          lastPos = currentSection.endPos;
      }

      // Sort children (sections and any initial content nodes) by start position
      parent.children.sort((a, b) => a.startPos - b.startPos);
  }

    
    private parseEnvironments(parentNode: LaTeXNode, currentContent: string, contentOffset: number, depth: number = 0): void {
      if (depth > 20) {
          console.warn(`Maximum environment nesting depth exceeded at offset ${contentOffset} - stopping recursion`);
          return;
      }

      // Regex to find the *next* top-level environment within the currentContent
      // We need a way to handle nesting properly. Regex alone is very hard for this.
      // Let's try a different approach: Find all top-level environments first.

      const envRegex = /\\begin\{([^}]*?)\}/g; // Find start tags
      let match;
      let currentPos = 0;

      while ((match = envRegex.exec(currentContent)) !== null) {
          // Check if this match is inside an already processed range (skip if so)
           if (match.index < currentPos) {
               continue;
           }

          const envName = match[1];
          const beginTag = match[0];
          const beginIndex = match.index;

          // Find the corresponding \end tag, respecting nesting
          const endTag = `\\end{${envName}}`;
          let nestingLevel = 1;
          let searchPos = beginIndex + beginTag.length;
          let endIndex = -1;

          while (searchPos < currentContent.length) {
              const nextBegin = currentContent.indexOf(`\\begin{${envName}}`, searchPos);
              const nextEnd = currentContent.indexOf(endTag, searchPos);

              if (nextEnd === -1) {
                  // No matching end tag found in the remaining content - malformed LaTeX?
                  console.warn(`No matching '${endTag}' found for environment starting at offset ${contentOffset + beginIndex}`);
                  // Move past this begin tag to avoid infinite loop if regex re-matches
                  currentPos = beginIndex + beginTag.length;
                  break; // Stop searching for this specific environment
              }

              if (nextBegin !== -1 && nextBegin < nextEnd) {
                  // Found a nested begin tag first
                  nestingLevel++;
                  searchPos = nextBegin + beginTag.length;
              } else {
                  // Found an end tag
                  nestingLevel--;
                  if (nestingLevel === 0) {
                      // This is the matching end tag for our starting begin tag
                      endIndex = nextEnd;
                      break;
                  }
                  // Continue searching after this end tag
                  searchPos = nextEnd + endTag.length;
              }
          }


          if (endIndex !== -1) {
              // Found a complete environment
              const envStartPos = contentOffset + beginIndex;
              const envEndPos = contentOffset + endIndex + endTag.length;
              const fullEnvContent = this.content.substring(envStartPos, envEndPos); // Get from original full content
              const innerEnvContent = this.content.substring(envStartPos + beginTag.length, contentOffset + endIndex);

              const environmentNode: LaTeXNode = {
                  type: 'environment',
                  name: envName,
                  content: fullEnvContent, // The full \begin{}...\end{} block
                  children: [],
                  parent: parentNode,
                  startPos: envStartPos,
                  endPos: envEndPos,
                  meta: {
                      innerContent: innerEnvContent // Store just the inner part
                  }
              };

              parentNode.children.push(environmentNode);

              // Recursively parse the *inner* content of this environment
              // Pass the inner content string, its offset relative to the start of the document, and increment depth
              this.parseEnvironments(environmentNode, innerEnvContent, envStartPos + beginTag.length, depth + 1);

              // Update currentPos to continue searching after this environment
              currentPos = endIndex + endTag.length;

          }
          // If endIndex remained -1, the loop correctly broke, and currentPos was updated.
      }

      // After finding all environments, parse remaining text as paragraphs etc.
      // This might need further refinement depending on how you handle text nodes.
      // For now, the focus is fixing the environment recursion.
       this.parseInlineEquations(parentNode); // Maybe parse equations within text not inside envs?
       this.parseParagraphs(parentNode); // Parse remaining text nodes


  }

    
    private parseInlineEquations(parent: LaTeXNode): void {
      // Single $ and double $$ equations
      const singleDollarRegex = /\$([^\$]+?)\$/g;
      const doubleDollarRegex = /\$\$([^\$]+?)\$\$/g;
      const latexRegex = /\\\((.*?)\\\)|\\\[(.*?)\\\]/g;
      
      // Process single dollar equations
      let match;
      while ((match = singleDollarRegex.exec(parent.content)) !== null) {
        const startPos = parent.startPos + match.index;
        const endPos = startPos + match[0].length;
        
        const equation: LaTeXNode = {
          type: 'equation',
          content: match[0],
          children: [],
          parent: parent,
          startPos,
          endPos,
          meta: {
            mode: 'inline',
            innerContent: match[1]
          }
        };
        
        parent.children.push(equation);
      }
      
      // Process double dollar equations
      while ((match = doubleDollarRegex.exec(parent.content)) !== null) {
        const startPos = parent.startPos + match.index;
        const endPos = startPos + match[0].length;
        
        const equation: LaTeXNode = {
          type: 'equation',
          content: match[0],
          children: [],
          parent: parent,
          startPos,
          endPos,
          meta: {
            mode: 'display',
            innerContent: match[1]
          }
        };
        
        parent.children.push(equation);
      }
      
      // Process \( \) and \[ \] equations
      while ((match = latexRegex.exec(parent.content)) !== null) {
        const startPos = parent.startPos + match.index;
        const endPos = startPos + match[0].length;
        const isInline = match[0].startsWith('\\(');
        
        const equation: LaTeXNode = {
          type: 'equation',
          content: match[0],
          children: [],
          parent: parent,
          startPos,
          endPos,
          meta: {
            mode: isInline ? 'inline' : 'display',
            innerContent: isInline ? match[1] : match[2]
          }
        };
        
        parent.children.push(equation);
      }
    }
    
    private parseParagraphs(parent: LaTeXNode): void {
      // Find positions of all children
      const childPositions = parent.children
        .map(child => ({ start: child.startPos, end: child.endPos }))
        .sort((a, b) => a.start - b.start);
      
      // Extract paragraphs between these positions
      let lastEndPos = parent.startPos;
      
      for (const pos of childPositions) {
        if (pos.start > lastEndPos) {
          const paragraphText = this.content.substring(lastEndPos, pos.start).trim();
          
          if (paragraphText.length > 0) {
            const paragraph: LaTeXNode = {
              type: 'paragraph',
              content: paragraphText,
              children: [],
              parent: parent,
              startPos: lastEndPos,
              endPos: pos.start
            };
            
            parent.children.push(paragraph);
          }
        }
        
        lastEndPos = pos.end;
      }
      
      // Add final paragraph after the last child
      if (lastEndPos < parent.endPos) {
        const paragraphText = this.content.substring(lastEndPos, parent.endPos).trim();
        
        if (paragraphText.length > 0) {
          const paragraph: LaTeXNode = {
            type: 'paragraph',
            content: paragraphText,
            children: [],
            parent: parent,
            startPos: lastEndPos,
            endPos: parent.endPos
          };
          
          parent.children.push(paragraph);
        }
      }
      
      // Sort all children by start position
      parent.children.sort((a, b) => a.startPos - b.startPos);
    }
    
    private addLineNumbers(node: LaTeXNode, content: string): void {
      // Calculate line numbers for each node
      const lines = content.substring(0, node.startPos).split('\n');
      node.lineStart = lines.length;
      
      const linesEnd = content.substring(0, node.endPos).split('\n');
      node.lineEnd = linesEnd.length;
      
      // Process children recursively
      for (const child of node.children) {
        this.addLineNumbers(child, content);
      }
    }
    
    // Utility method to find nodes by type
    public findNodesByType(root: LaTeXNode, type: string): LaTeXNode[] {
      const results: LaTeXNode[] = [];
      
      const traverse = (node: LaTeXNode) => {
        if (node.type === type) {
          results.push(node);
        }
        
        for (const child of node.children) {
          traverse(child);
        }
      };
      
      traverse(root);
      return results;
    }
    
    // Find nodes containing specific text
    public findNodesByContent(root: LaTeXNode, searchText: string): LaTeXNode[] {
      const results: LaTeXNode[] = [];
      
      const traverse = (node: LaTeXNode) => {
        if (node.content.includes(searchText)) {
          results.push(node);
        }
        
        for (const child of node.children) {
          traverse(child);
        }
      };
      
      traverse(root);
      return results;
    }
    
    // Find nodes matching a regular expression
    public findNodesByRegex(root: LaTeXNode, regex: RegExp): LaTeXNode[] {
      const results: LaTeXNode[] = [];
      
      const traverse = (node: LaTeXNode) => {
        if (regex.test(node.content)) {
          results.push(node);
        }
        
        for (const child of node.children) {
          traverse(child);
        }
      };
      
      traverse(root);
      return results;
    }
    
    // Find nodes by name (for sections, environments)
    public findNodesByName(root: LaTeXNode, name: string): LaTeXNode[] {
      const results: LaTeXNode[] = [];
      
      const traverse = (node: LaTeXNode) => {
        if (node.name === name) {
          results.push(node);
        }
        
        for (const child of node.children) {
          traverse(child);
        }
      };
      
      traverse(root);
      return results;
    }
    
    // Apply an edit to the document
    public applyEdit(root: LaTeXNode, targetNode: LaTeXNode, editType: 'insert' | 'replace' | 'delete', content: string): string {
      // Get original document content
      const originalContent = this.content;
      
      switch (editType) {
        case 'insert':
          return originalContent.substring(0, targetNode.endPos) + 
                 content + 
                 originalContent.substring(targetNode.endPos);
        
        case 'replace':
          return originalContent.substring(0, targetNode.startPos) + 
                 content + 
                 originalContent.substring(targetNode.endPos);
        
        case 'delete':
          return originalContent.substring(0, targetNode.startPos) + 
                 originalContent.substring(targetNode.endPos);
        
        default:
          return originalContent;
      }
    }
  }