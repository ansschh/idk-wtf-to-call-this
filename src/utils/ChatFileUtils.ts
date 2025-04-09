// utils/ChatFileUtils.ts
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import {
  doc,
  collection,
  addDoc,
  getDoc,
  updateDoc,
  serverTimestamp,
  query, // Added query import
  where, // Added where import
  getDocs // Added getDocs import
} from 'firebase/firestore';
import { db, storage } from '@/lib/firebase';

// Logger replacement using console
const Logger = console;

/**
 * Interface for file handling result
 */
interface FileHandlingResult {
  success: boolean;
  data?: { // Consistent data structure
    id: string; // Temporary ID or reference
    name: string;
    type: string;
    size: number;
    url: string; // This will be the HTTPS URL for images/binaries or relevant identifier
    content?: string | null; // Text content or null for non-text
    uploadedAt: string; // ISO string timestamp
    // Add other potential fields from Firestore if needed later
    fileType?: string;
    parentId?: string | null;
  };
  url?: string; // Keep for potential direct use or backward compatibility
  content?: string | null; // Allow null
  error?: string;
}

/**
 * Utility class for managing file operations in the chat interface and project
 */
export class ChatFileUtils {
  /**
   * Upload a file for chat attachment.
   * - Images/Binaries go to Firebase Storage, returning HTTPS downloadURL.
   * - Text files have content read. Storage upload for text is optional.
   * @param file The file to upload
   * @param projectId Current project ID
   * @param userId User ID
   * @returns Promise with upload result including data object
   */
// utils/ChatFileUtils.ts - With CORS Fix

/**
 * Upload a file for chat attachment.
 * - Images/Binaries go to Firebase Storage, returning HTTPS downloadURL.
 * - Text files have content read. Storage upload for text is optional.
 * @param file The file to upload
 * @param projectId Current project ID
 * @param userId User ID
 * @returns Promise with upload result including data object
 */
static async uploadChatFile(
  file: File,
  projectId: string,
  userId: string
): Promise<FileHandlingResult> {
  const tempId = `chat-file-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  Logger.log(`[ChatFileUtils] Processing ${file.name} (${file.type})`);

  try {
    // Determine file type for handling
    const isTextFile =
      file.type.startsWith('text/') ||
      /\.(txt|tex|bib|md|json|csv|xml|html|css|js|ts|py|java|c|cpp|h|hpp|sh|cls|sty|log|r|sql|yaml|toml)$/i.test(file.name);
    const isImage = file.type.startsWith('image/');

    let fileContent: string | null = null;
    let url: string = '';

    // --- CHANGE OF APPROACH: Always use DataURL for images in chat context ---
    if (isImage) {
      Logger.log(`[ChatFileUtils] Reading image as dataURL for chat: ${file.name}`);
      try {
        // For images, just use dataURL to avoid CORS issues entirely
        fileContent = await this.readFileAsDataURL(file);
        url = fileContent; // Use the dataURL as the URL
        Logger.log(`[ChatFileUtils] Successfully read image as dataURL. Size: ${fileContent.length}`);
      } catch (dataUrlError) {
        Logger.error(`[ChatFileUtils] Error reading image as dataURL:`, dataUrlError);
        throw new Error(`Failed to read image as dataURL: ${dataUrlError instanceof Error ? dataUrlError.message : 'Unknown error'}`);
      }
    } 
    // --- Handle TEXT Files ---
    else if (isTextFile) {
      Logger.log(`[ChatFileUtils] Reading text content for ${file.name}`);
      fileContent = await this.readFileAsText(file);
      url = ''; // No URL needed for text
      Logger.log(`[ChatFileUtils] Text content read for ${file.name}. Size: ${fileContent?.length ?? 0}`);
    }
    // --- Handle OTHER Files ---
    else {
      // For other file types, we can still try Firebase Storage
      // but have a fallback to prevent failures
      const timestamp = Date.now();
      const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storagePath = `chats/${projectId}/${userId}/${timestamp}_${safeFileName}`;
      const storageRef = ref(storage, storagePath);

      try {
        Logger.log(`[ChatFileUtils] Attempting Firebase Storage upload for: ${file.name}`);
        const metadata = {
          contentType: file.type,
          customMetadata: { 'userId': userId, 'projectId': projectId }
        };
        
        const uploadResult = await uploadBytes(storageRef, file, metadata);
        url = await getDownloadURL(storageRef);
        Logger.log(`[ChatFileUtils] Upload and URL successful for ${file.name}`);
      } catch (storageError) {
        Logger.warn(`[ChatFileUtils] Firebase Storage upload failed, using object URL: ${storageError}`);
        // Generate Blob URL as fallback for other file types
        url = URL.createObjectURL(file);
        Logger.log(`[ChatFileUtils] Created blob URL for ${file.name}: ${url}`);
      }
    }

    // --- Construct Success Response ---
    const resultData = {
      id: tempId,
      name: file.name,
      type: file.type,
      size: file.size,
      url: url,
      content: fileContent,
      uploadedAt: new Date().toISOString()
    };

    return {
      success: true,
      data: resultData,
      url: url,
      content: fileContent ?? undefined,
    };

  } catch (error) {
    Logger.error(`[ChatFileUtils] Error processing file ${file.name}:`, error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error processing file' 
    };
  }
}


  /**
   * Import a file to the project file tree (projectFiles collection)
   * Handles text, images (as dataURL in Firestore for small ones), and binaries (uploading to Storage)
   * @param file The file to import
   * @param projectId Current project ID
   * @param userId User ID
   * @param parentId Optional parent folder ID
   * @returns Promise with the created file ID and other data
   */
  static async importFileToProject(
    file: File,
    projectId: string,
    userId: string,
    parentId: string | null = null
  ): Promise<FileHandlingResult> {
    const timestamp = Date.now();
    const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    Logger.log(`[ChatFileUtils] Importing ${file.name} to project ${projectId}`);

    try {
      let content: string | null = null; // Use null for non-text content initially
      const isTextFile =
        file.type.startsWith('text/') ||
        /\.(txt|tex|bib|md|json|csv|xml|html|css|js|ts|py|java|c|cpp|h|hpp|sh|cls|sty|log|r|sql|yaml|toml)$/i.test(file.name);
      const isImage = file.type.startsWith('image/');
      const extension = file.name.split('.').pop()?.toLowerCase() || '';

      const fileData: Record<string, any> = {
        _name_: file.name, // Use _name_ consistently
        name: file.name,   // Keep 'name' for compatibility if needed
        type: 'file',
        projectId,
        parentId,
        ownerId: userId,
        createdAt: serverTimestamp(),
        lastModified: serverTimestamp(), // Use lastModified
        size: file.size,
        extension: extension,
        // 'order' field needs to be calculated if used (e.g., find max order in parent + 1)
        // order: await this.calculateNextOrder(projectId, parentId), // Example call
      };

      let downloadURL: string | null = null; // For binary files stored in Storage

      if (isTextFile) {
        fileData.fileType = 'text';
        content = await this.readFileAsText(file);
        fileData.content = content; // Store text content directly
        Logger.log(`[ChatFileUtils] Storing text file ${file.name} content in Firestore.`);
      } else if (isImage && file.size < 1000000) { // Store small images as dataURL (e.g., < 1MB)
        fileData.fileType = 'image_data_url'; // More specific type
        content = await this.readFileAsDataURL(file);
        fileData.content = content; // Store dataURL in content field
        Logger.log(`[ChatFileUtils] Storing small image ${file.name} as dataURL in Firestore.`);
      } else { // Larger images or other binary files go to Storage
        fileData.fileType = isImage ? 'image_storage' : 'binary_storage'; // More specific type
        fileData.content = null; // Don't store large content in Firestore doc

        const storagePath = `projects/${projectId}/files/${timestamp}_${safeFileName}`;
        const storageRef = ref(storage, storagePath);
        Logger.log(`[ChatFileUtils] Uploading large image/binary ${file.name} to Storage: ${storagePath}`);
        await uploadBytes(storageRef, file);
        downloadURL = await getDownloadURL(storageRef);
        fileData.downloadURL = downloadURL; // Store the Storage URL
        Logger.log(`[ChatFileUtils] Uploaded ${file.name} to Storage. URL: ${downloadURL.substring(0,70)}...`);
      }

      // Add the document to Firestore 'projectFiles' collection
      const docRef = await addDoc(collection(db, "projectFiles"), fileData);
      Logger.log(`[ChatFileUtils] File ${file.name} added to Firestore projectFiles collection, ID: ${docRef.id}`);

      return {
        success: true,
        data: {
          id: docRef.id,
          name: file.name,
          type: 'file',
          size: file.size,
          url: downloadURL || (content && content.startsWith('data:image') ? 'data_url_in_firestore' : ''), // Indicate source
          content: content, // Return content if it was read (text/small image)
          uploadedAt: new Date().toISOString(),
          fileType: fileData.fileType,
          parentId: parentId
        }
      };
    } catch (error) {
      Logger.error(`[ChatFileUtils] Error importing file ${file.name} to project:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error importing file'
      };
    }
  }

  /**
   * Get file content and metadata from the project files
   * Checks both 'projectFiles' and 'project_files' collections.
   * @param fileId The file ID to fetch
   * @returns Promise with the file content and metadata result
   */
  static async getFileContent(fileId: string): Promise<FileHandlingResult> {
    Logger.log(`[ChatFileUtils] Attempting to get content for fileId: ${fileId}`);
    try {
      let fileData: any = null;
      let fileDoc: any = null; // Firestore DocumentSnapshot
      let found = false;
      let collectionName = '';

      // Try common collection names
      const collectionsToTry = ["projectFiles", "project_files"];
      for (const collName of collectionsToTry) {
        try {
            const fileRef = doc(db, collName, fileId);
            fileDoc = await getDoc(fileRef);
            if (fileDoc.exists()) {
                fileData = fileDoc.data();
                // Check if marked as deleted
                if (fileData.deleted === true) {
                    Logger.warn(`[ChatFileUtils] File ${fileId} found in ${collName} but is marked as deleted.`);
                    return { success: false, error: 'File has been deleted' };
                }
                Logger.log(`[ChatFileUtils] Found file ${fileId} in collection '${collName}'.`);
                found = true;
                collectionName = collName;
                break; // Stop searching once found
            }
        } catch (innerError) {
            Logger.warn(`[ChatFileUtils] Error checking collection '${collName}' for file ${fileId}:`, innerError);
        }
      }

      // If found in either collection and not deleted
      if (found && fileData) {
        const name = fileData._name_ || fileData.name || 'Untitled';
        const type = fileData.type || 'file';
        const fileType = fileData.fileType || (name.endsWith('.tex') ? 'text' : 'binary');
        const url = fileData.downloadURL || fileData.url || '';
        let content = fileData.content || '';

        // Handle potential data URLs stored in content field
        if (fileType === 'image_data_url' && content.startsWith('data:image')) {
            // Keep content as dataURL
        }
        // If it's stored in storage, content field might be empty/null in firestore doc
        else if (fileType === 'image_storage' || fileType === 'binary_storage') {
            content = ''; // Don't return potentially empty/null content field if storage URL exists
        }

        return {
          success: true,
          content: content, // Text content, dataURL (small images), or empty string
          data: {
            id: fileDoc.id,
            name: name,
            type: type,
            size: fileData.size || 0,
            url: url, // Storage URL if available
            content: content, // Include here too
            uploadedAt: fileData.createdAt?.toDate?.().toISOString() || new Date().toISOString(),
            fileType: fileType,
            parentId: fileData.parentId || null
          },
          url: url
        };
      }

      // If not found in any searched collection
      Logger.warn(`[ChatFileUtils] File ${fileId} not found in any checked collection.`);
      return { success: false, error: 'File not found' };

    } catch (error) {
      Logger.error(`[ChatFileUtils] Error getting file content for ${fileId}:`, error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error getting file content' };
    }
  }

  /**
   * Read file as text (static helper)
   * @param file The file to read
   * @returns Promise with the file text content
   */
  static readFileAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!file) return reject(new Error("File object is null or undefined."));
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
        } else {
          // Handle ArrayBuffer case if needed, though readAsText should yield string
          resolve(new TextDecoder().decode(reader.result as ArrayBuffer));
        }
      };
      reader.onerror = (error) => reject(new Error(`Failed to read file ${file.name} as text: ${reader.error?.message || error}`));
      reader.readAsText(file); // Ensure this is called
    });
  }

  /**
   * Read file as data URL (static helper)
   * @param file The file to read
   * @returns Promise with the file as data URL
   */
  static readFileAsDataURL(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!file) return reject(new Error("File object is null or undefined."));
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
        } else {
          reject(new Error(`Failed to read file ${file.name} as data URL: Invalid result type.`));
        }
      };
      reader.onerror = (error) => reject(new Error(`Failed to read file ${file.name} as data URL: ${reader.error?.message || error}`));
      reader.readAsDataURL(file); // Ensure this is called
    });
  }

  /**
   * Create a file mention string for chat messages (static helper)
   * @param fileName The file name
   * @param fileId The file ID
   * @returns Formatted mention string
   */
  static createFileMention(fileName: string, fileId: string): string {
    return `@[${fileName}](${fileId})`;
  }

  /**
   * Update chat message with file suggestions (Placeholder - implement actual logic if needed)
   * @param messageId The message ID to update
   * @param sessionId The chat session ID
   * @param suggestion The suggestion content
   * @param range Optional text range information
   * @param fileId Optional target file ID
   */
  static async updateMessageWithSuggestion(
    messageId: string,
    sessionId: string,
    suggestion: string,
    range?: {start: number, end: number},
    fileId?: string
  ): Promise<void> {
    Logger.warn("[ChatFileUtils] updateMessageWithSuggestion called - Ensure implementation if required.");
    // Example implementation (adjust based on your needs):
    // try {
    //   const messageRef = doc(db, "chatSessions", sessionId, "messages", messageId);
    //   await updateDoc(messageRef, {
    //     'suggestionData': { // Use a structured field
    //       text: suggestion,
    //       range: range || null,
    //       fileId: fileId || null,
    //       applied: false // Track application status
    //     },
    //     lastModified: serverTimestamp()
    //   });
    // } catch (error) {
    //   console.error('Error updating message with suggestion:', error);
    //   throw error;
    // }
  }

  // --- Optional: Helper to calculate next order for imported files ---
  // static async calculateNextOrder(projectId: string, parentId: string | null): Promise<number> {
  //     try {
  //         const q = query(
  //             collection(db, "projectFiles"),
  //             where("projectId", "==", projectId),
  //             where("parentId", "==", parentId),
  //             orderBy("order", "desc"),
  //             limit(1)
  //         );
  //         const snapshot = await getDocs(q);
  //         if (!snapshot.empty) {
  //             const lastItem = snapshot.docs[0].data();
  //             return (lastItem.order || 0) + 1;
  //         }
  //         return 0; // First item in this parent
  //     } catch (error) {
  //         Logger.error("Error calculating next order:", error);
  //         return 0; // Default to 0 on error
  //     }
  // }
}