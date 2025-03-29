// utils/DocumentContextManager.ts
import { LaTeXNode, LaTeXTreeProcessor } from './LaTeXTreeProcessor';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export interface DocumentContext {
  currentFile: {
    id: string;
    name: string;
    content: string;
    documentTree: LaTeXNode;
  };
  projectFiles: Array<{
    id: string;
    name: string;
    type: string;
    parentId: string | null;
  }>;
}

export class DocumentContextManager {
  private projectId: string;
  private userId: string;
  private currentFileId: string | null = null;
  private documentTree: LaTeXNode | null = null;
  private fileContent: string = '';
  private projectFiles: Array<{
    id: string;
    name: string;
    type: string;
    parentId: string | null;
  }> = [];
  private treeProcessor: LaTeXTreeProcessor;
  
  constructor(projectId: string, userId: string) {
    this.projectId = projectId;
    this.userId = userId;
    this.treeProcessor = new LaTeXTreeProcessor();
  }
  
  public async initializeContext(fileId: string | null = null): Promise<DocumentContext | null> {
    try {
      // Load project files
      await this.loadProjectFiles();
      
      // Load current file if provided
      if (fileId) {
        await this.loadCurrentFile(fileId);
      }
      
      if (!this.fileContent) {
        return null;
      }
      
      return {
        currentFile: {
          id: this.currentFileId!,
          name: this.getCurrentFileName(),
          content: this.fileContent,
          documentTree: this.documentTree!
        },
        projectFiles: this.projectFiles
      };
    } catch (error) {
      console.error('Error initializing document context:', error);
      return null;
    }
  }
  
  private async loadProjectFiles(): Promise<void> {
    try {
      // Try projectFiles collection first
      const filesRef = collection(db, 'projectFiles');
      const q = query(filesRef, where('projectId', '==', this.projectId));
      
      const querySnapshot = await getDocs(q);
      const files: Array<{
        id: string;
        name: string;
        type: string;
        parentId: string | null;
      }> = [];
      
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        // Ensure file isn't deleted
        if (!data.deleted) {
          files.push({
            id: doc.id,
            name: data._name_ || data.name || 'Untitled',
            type: data.type || 'file',
            parentId: data.parentId || null
          });
        }
      });
      
      // If no files found, try project_files collection as fallback
      if (files.length === 0) {
        const altFilesRef = collection(db, 'project_files');
        const altQ = query(altFilesRef, where('projectId', '==', this.projectId));
        
        const altQuerySnapshot = await getDocs(altQ);
        
        altQuerySnapshot.forEach((doc) => {
          const data = doc.data();
          // Ensure file isn't deleted
          if (!data.deleted) {
            files.push({
              id: doc.id,
              name: data._name_ || data.name || 'Untitled',
              type: data.type || 'file',
              parentId: data.parentId || null
            });
          }
        });
      }
      
      this.projectFiles = files;
    } catch (error) {
      console.error('Error loading project files:', error);
      throw error;
    }
  }
  
  private async loadCurrentFile(fileId: string): Promise<void> {
    try {
      let fileData: any = null;
      let foundDoc = false;
      
      // Try projectFiles first
      try {
        const fileRef = doc(db, 'projectFiles', fileId);
        const fileDoc = await getDoc(fileRef);
        
        if (fileDoc.exists()) {
          fileData = fileDoc.data();
          foundDoc = true;
        }
      } catch (err) {
        console.log('Document not found in projectFiles');
      }
      
      // If not found, try project_files
      if (!foundDoc) {
        try {
          const fileRef = doc(db, 'project_files', fileId);
          const fileDoc = await getDoc(fileRef);
          
          if (fileDoc.exists()) {
            fileData = fileDoc.data();
            foundDoc = true;
          }
        } catch (err) {
          console.log('Document not found in project_files');
        }
      }
      
      if (foundDoc && fileData) {
        this.currentFileId = fileId;
        this.fileContent = fileData.content || '';
        
        // Parse document into tree
        this.documentTree = this.treeProcessor.parseDocument(this.fileContent);
      } else {
        throw new Error(`File not found: ${fileId}`);
      }
    } catch (error) {
      console.error('Error loading current file:', error);
      throw error;
    }
  }
  
  private getCurrentFileName(): string {
    if (this.currentFileId) {
      const file = this.projectFiles.find(f => f.id === this.currentFileId);
      return file ? file.name : 'Untitled';
    }
    return 'Untitled';
  }
  
  public getDocumentTree(): LaTeXNode | null {
    return this.documentTree;
  }
  
  public getDocumentContent(): string {
    return this.fileContent;
  }
  
  public getProjectFiles(): Array<{
    id: string;
    name: string;
    type: string;
    parentId: string | null;
  }> {
    return this.projectFiles;
  }
}