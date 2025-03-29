// utils/EditIntentAnalyzer.ts
import { LaTeXNode, LaTeXTreeProcessor } from './LaTeXTreeProcessor';

export interface EditIntent {
  editType: 'insert' | 'replace' | 'delete';
  targetNode: LaTeXNode;
  content: string;
  confidence: number;
}

export class EditIntentAnalyzer {
  private documentTree: LaTeXNode;
  private treeProcessor: LaTeXTreeProcessor;
  private originalContent: string;
  
  constructor(documentTree: LaTeXNode, originalContent: string) {
    this.documentTree = documentTree;
    this.originalContent = originalContent;
    this.treeProcessor = new LaTeXTreeProcessor();
  }
  
  // In utils/EditIntentAnalyzer.ts - Modify the analyzeIntent method
public analyzeIntent(suggestion: string, prompt: string): EditIntent {
    // 1. Extract command patterns and keywords
    const keywords = this.extractKeywords(prompt);
    const editType = this.determineEditType(prompt, suggestion);
    
    // 2. Find potential target locations
    const targetLocations = this.findPotentialTargets(keywords, suggestion, prompt);
    
    // 3. Extract content to apply
    const editContent = this.extractEditableContent(suggestion);
    
    // 4. Check if we found any potential targets
    if (targetLocations.length === 0) {
      // Fallback: If no specific target found, use the document's root or body node
      const bodyNodes = this.treeProcessor.findNodesByType(this.documentTree, 'body');
      const targetNode = bodyNodes.length > 0 ? bodyNodes[0] : this.documentTree;
      
      return {
        editType,
        targetNode,
        content: editContent,
        confidence: 0.5 // Lower confidence since we're using a fallback
      };
    }
    
    // Use the best match with highest confidence
    const bestMatch = targetLocations[0];
    
    return {
      editType,
      targetNode: bestMatch.node,
      content: editContent,
      confidence: bestMatch.score
    };
  }
  
  private extractKeywords(prompt: string): string[] {
    // Extract key terms from the prompt
    const keywords: string[] = [];
    
    // Look for section references
    const sectionRegex = /(section|chapter|part|subsection)\s+(?:called|named|titled|about|on)?\s*["']?([\w\s]+)["']?/gi;
    let match;
    
    while ((match = sectionRegex.exec(prompt)) !== null) {
      keywords.push(match[2].trim().toLowerCase());
    }
    
    // Look for specific LaTeX commands
    const commandRegex = /\\(\w+)/g;
    while ((match = commandRegex.exec(prompt)) !== null) {
      keywords.push(`\\${match[1]}`);
    }
    
    // Look for quoted content
    const quoteRegex = /["']([\w\s]+)["']/g;
    while ((match = quoteRegex.exec(prompt)) !== null) {
      keywords.push(match[1].trim().toLowerCase());
    }
    
    // Add common keywords based on prompt
    if (prompt.includes('equation') || prompt.includes('math')) {
      keywords.push('equation', 'math', '$', '\\begin{equation}');
    }
    
    if (prompt.includes('figure') || prompt.includes('image')) {
      keywords.push('figure', '\\includegraphics', '\\begin{figure}');
    }
    
    if (prompt.includes('table')) {
      keywords.push('table', '\\begin{table}', '\\begin{tabular}');
    }
    
    return keywords;
  }
  
  private determineEditType(prompt: string, suggestion: string): 'insert' | 'replace' | 'delete' {
    // Determine edit type based on prompt and suggestion
    const lowerPrompt = prompt.toLowerCase();
    
    if (lowerPrompt.includes('delete') || 
        lowerPrompt.includes('remove') || 
        lowerPrompt.includes('eliminate')) {
      return 'delete';
    }
    
    if (lowerPrompt.includes('replace') || 
        lowerPrompt.includes('change') || 
        lowerPrompt.includes('modify') || 
        lowerPrompt.includes('update') ||
        lowerPrompt.includes('rewrite')) {
      return 'replace';
    }
    
    // Default to insert
    return 'insert';
  }
  
  private extractEditableContent(suggestion: string): string {
    // Extract LaTeX content from suggestion
    
    // Try to find content in code blocks
    const codeBlockRegex = /```(?:latex)?\n([\s\S]*?)\n```/;
    const codeMatch = codeBlockRegex.exec(suggestion);
    
    if (codeMatch) {
      return codeMatch[1].trim();
    }
    
    // Try to find equations between $ or $$ signs
    const dollarRegex = /\$\$([\s\S]*?)\$\$|\$([\s\S]*?)\$/;
    const dollarMatch = dollarRegex.exec(suggestion);
    
    if (dollarMatch) {
      return dollarMatch[1] || dollarMatch[2];
    }
    
    // Try to find LaTeX environments
    const envRegex = /\\begin\{(\w+)\}([\s\S]*?)\\end\{\1\}/;
    const envMatch = envRegex.exec(suggestion);
    
    if (envMatch) {
      return envMatch[0];
    }
    
    // No specific format found, use the entire suggestion
    // (We'll clean it up a bit by removing markdown formatting)
    return suggestion
      .replace(/^#+ .*$/gm, '') // Remove markdown headers
      .replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold
      .replace(/\*(.*?)\*/g, '$1') // Remove italic
      .replace(/\[(.*?)\]\(.*?\)/g, '$1') // Remove links
      .trim();
  }
  
  private findPotentialTargets(
    keywords: string[], 
    suggestion: string, 
    prompt: string
  ): Array<{node: LaTeXNode, score: number}> {
    const candidates: Array<{node: LaTeXNode, score: number}> = [];
    
    // Strategy 1: Look for exact quoted content from the document
    const exactMatches = this.findExactContentMatches(suggestion, prompt);
    if (exactMatches.length > 0) {
      candidates.push(...exactMatches.map(node => ({
        node,
        score: 0.95 // High confidence for exact matches
      })));
    }
    
    // Strategy 2: Look for section names mentioned in the prompt
    const sectionMatches = this.findSectionMatches(prompt);
    if (sectionMatches.length > 0) {
      candidates.push(...sectionMatches.map(node => ({
        node,
        score: 0.8
      })));
    }
    
    // Strategy 3: Look for keyword matches
    const keywordMatches = this.findKeywordMatches(keywords);
    if (keywordMatches.length > 0) {
      candidates.push(...keywordMatches.map((match, index) => ({
        node: match,
        // Decrease confidence with each subsequent match
        score: 0.7 - (index * 0.05)
      })));
    }
    
    // Strategy 4: Check for environment types
    const environmentMatches = this.findEnvironmentMatches(prompt, suggestion);
    if (environmentMatches.length > 0) {
      candidates.push(...environmentMatches.map(node => ({
        node,
        score: 0.75
      })));
    }
    
    // Sort by score and return
    return candidates.sort((a, b) => b.score - a.score);
  }
  
  private findExactContentMatches(suggestion: string, prompt: string): LaTeXNode[] {
    // Look for quotes in the suggestion that might be referencing document content
    const quoteRegex = /["']([\w\s\.,;:!?]+)["']/g;
    const results: LaTeXNode[] = [];
    
    let match;
    while ((match = quoteRegex.exec(suggestion)) !== null) {
      const quotedText = match[1].trim();
      
      // Only consider quoted text of reasonable length
      if (quotedText.length > 10) {
        // Find nodes containing this exact text
        const matches = this.treeProcessor.findNodesByContent(this.documentTree, quotedText);
        results.push(...matches);
      }
    }
    
    return results;
  }
  
  private findSectionMatches(prompt: string): LaTeXNode[] {
    // Extract section references from the prompt
    const sectionRegex = /(section|chapter|part|subsection)\s+(?:called|named|titled|about|on)?\s*["']?([\w\s]+)["']?/gi;
    const results: LaTeXNode[] = [];
    
    let match;
    while ((match = sectionRegex.exec(prompt)) !== null) {
      const sectionType = match[1].toLowerCase();
      const sectionName = match[2].trim();
      
      // Find sections with this name
      const sections = this.treeProcessor.findNodesByName(this.documentTree, sectionName);
      
      // Only keep sections of the correct type
      const matchingSections = sections.filter(node => node.type.toLowerCase() === sectionType);
      
      if (matchingSections.length > 0) {
        results.push(...matchingSections);
      } else if (sections.length > 0) {
        // If no exact type match, use any section with the name
        results.push(...sections);
      }
    }
    
    return results;
  }
  
  private findKeywordMatches(keywords: string[]): LaTeXNode[] {
    const results: LaTeXNode[] = [];
    
    for (const keyword of keywords) {
      // Skip very short keywords
      if (keyword.length < 3) continue;
      
      // Try to find nodes containing this keyword
      const matches = this.treeProcessor.findNodesByContent(this.documentTree, keyword);
      
      if (matches.length > 0) {
        // Add the first few matches
        results.push(...matches.slice(0, 3));
      }
    }
    
    return results;
  }
  
  private findEnvironmentMatches(prompt: string, suggestion: string): LaTeXNode[] {
    const results: LaTeXNode[] = [];
    
    // Check if the suggestion contains an environment
    const envRegex = /\\begin\{(\w+)\}/;
    const envMatch = envRegex.exec(suggestion);
    
    if (envMatch) {
      const envName = envMatch[1];
      
      // Find similar environments in the document
      const environments = this.treeProcessor.findNodesByType(this.documentTree, 'environment');
      const matchingEnvs = environments.filter(node => node.name === envName);
      
      if (matchingEnvs.length > 0) {
        results.push(...matchingEnvs);
      }
    }
    
    // Check for equation-related content
    if (suggestion.includes('$') || suggestion.includes('\\begin{equation}')) {
      const equations = this.treeProcessor.findNodesByType(this.documentTree, 'equation');
      
      if (equations.length > 0) {
        // Find the most relevant equation based on prompt
        results.push(...equations.slice(0, 2));
      }
    }
    
    return results;
  }
}