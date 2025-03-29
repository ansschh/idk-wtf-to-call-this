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
      // Parse preamble (everything before \begin{document})
      const docStartIndex = this.content.indexOf('\\begin{document}');
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
      }
      
      // Parse document body
      const bodyStartIndex = docStartIndex !== -1 ? docStartIndex + '\\begin{document}'.length : 0;
      const docEndIndex = this.content.indexOf('\\end{document}');
      const bodyEndIndex = docEndIndex !== -1 ? docEndIndex : this.content.length;
      
      const body: LaTeXNode = {
        type: 'body',
        content: this.content.substring(bodyStartIndex, bodyEndIndex),
        children: [],
        parent: root,
        startPos: bodyStartIndex,
        endPos: bodyEndIndex
      };
      root.children.push(body);
      
      // Parse sections and subsections
      this.parseSections(body);
      
      // Parse environments
      this.parseEnvironments(body);
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
      // Regex for sections
      const sectionTypes = ['section', 'subsection', 'subsubsection', 'paragraph', 'subparagraph'];
      const sectionStartPos: number[] = [];
      const sectionNodes: LaTeXNode[] = [];
      
      // Find all section start positions
      for (const sectionType of sectionTypes) {
        const regex = new RegExp(`\\\\${sectionType}\\*?\\{(.*?)\\}`, 'g');
        let match;
        
        while ((match = regex.exec(parent.content)) !== null) {
          const startPos = parent.startPos + match.index;
          const endPos = startPos + match[0].length;
          
          const section: LaTeXNode = {
            type: sectionType,
            name: match[1],
            content: match[0],
            children: [],
            parent: parent,
            startPos,
            endPos,
            meta: {
              title: match[1],
              isStarred: match[0].includes('*')
            }
          };
          
          sectionStartPos.push(startPos);
          sectionNodes.push(section);
        }
      }
      
      // Sort sections by start position
      const sorted = sectionNodes
        .map((node, index) => ({ node, startPos: sectionStartPos[index] }))
        .sort((a, b) => a.startPos - b.startPos);
      
      // Calculate section content (everything up to the next section)
      for (let i = 0; i < sorted.length; i++) {
        const current = sorted[i].node;
        const nextStartPos = i < sorted.length - 1 
          ? sorted[i + 1].startPos 
          : parent.startPos + parent.content.length;
        
        current.content = this.content.substring(current.startPos, nextStartPos);
        current.endPos = nextStartPos;
        
        // Add section to parent
        parent.children.push(current);
        
        // Process environments and paragraphs within this section
        this.parseEnvironments(current);
      }
    }
    
    private parseEnvironments(parent: LaTeXNode, depth: number = 0): void {
        // Add a recursion depth limit to prevent stack overflow
        if (depth > 20) { // 20 is a reasonable maximum nesting depth for LaTeX
          console.warn("Maximum environment nesting depth exceeded - stopping recursion");
          return;
        }
      
        // Use a non-greedy regex to prevent catastrophic backtracking
        const envRegex = /\\begin\{([^}]*?)\}([\s\S]*?)\\end\{\1\}/g;
        
        let match;
        while ((match = envRegex.exec(parent.content)) !== null) {
          const envName = match[1];
          const startPos = parent.startPos + match.index;
          const endPos = startPos + match[0].length;
          
          const environment: LaTeXNode = {
            type: 'environment',
            name: envName,
            content: match[0],
            children: [],
            parent: parent,
            startPos,
            endPos,
            meta: {
              innerContent: match[2]
            }
          };
          
          parent.children.push(environment);
          
          // Process nested environments with depth tracking
          if (match[2].includes('\\begin{')) {
            this.parseEnvironments(environment, depth + 1);
          }
        }      
      
      // Parse equations that aren't environments (e.g., $...$ or $$...$$)
      this.parseInlineEquations(parent);
      
      // Parse text paragraphs between environments and commands
      this.parseParagraphs(parent);
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