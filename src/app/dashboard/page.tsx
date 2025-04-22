// --- START OF UPDATED FILE page.tsx ---

"use client";
import React, { useState, useRef, useEffect, useCallback } from 'react';
import Link from "next/link";
import Image from "next/image";
import { useUser, UserButton } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { authenticateWithFirebase } from '../../lib/firebase-auth';
import EditorLoadingScreen from '../../components/EditorLoadingScreen';
import {
  collection,
  query,
  where,
  getDocs,
  updateDoc,
  addDoc,
  doc,
  orderBy,
  serverTimestamp,
  deleteDoc // Added for potential permanent delete later
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useProjects } from "../../hooks/useProjects"; // Assuming this hook works as intended

// Icons
import {
  Plus,
  Search,
  FileText,
  Grid,
  List,
  FolderOpen,
  Share2,
  Archive,
  Trash2,
  MoreHorizontal,
  ChevronDown,
  Calendar,
  Loader,
  AlertCircle,
  Clock,
  ExternalLink,
  Book,
  Edit,
  Download,
  Star,
  Users,
  Command, // Kept Command icon, replace if needed
  TrendingUp,
  Menu,
  X,
  ArchiveRestore // Added for potential Unarchive action
} from "lucide-react";

// Type for Project (ensure consistency with useProjects hook if possible)
interface Project {
  id: string;
  title: string;
  owner: string; // User ID of the owner
  template?: string;
  createdAt?: any; // Firestore Timestamp or Date
  lastModified?: any; // Firestore Timestamp or Date
  archived?: boolean;
  trashed?: boolean;
  collaborators?: string[];
  description?: string; // Optional description
}

// --- New Project Context Menu Component ---
const ProjectContextMenu = ({
  isOpen,
  x,
  y,
  project,
  onClose,
  onRename,
  onArchive,
  onTrash,
  onUnarchive, // Added for unarchive
  onRestore, // Added for restore from trash
  onDeletePermanently // Added for permanent delete
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        onClose();
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !project) return null;

  const isArchived = project.archived;
  const isTrashed = project.trashed;

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-white rounded-md shadow-lg border border-gray-200 py-1 min-w-[160px]"
      style={{ top: `${y}px`, left: `${x}px` }}
    >
      {!isTrashed && !isArchived && (
        <>
          <button
            onClick={() => { onRename(project.id, project.title); onClose(); }}
            className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 flex items-center"
          >
            <Edit className="h-4 w-4 mr-2 text-gray-500" />
            Rename
          </button>
          <button
            onClick={() => { onArchive(project.id); onClose(); }}
            className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 flex items-center"
          >
            <Archive className="h-4 w-4 mr-2 text-gray-500" />
            Archive
          </button>
        </>
      )}
      {isArchived && (
        <button
          onClick={() => { onUnarchive(project.id); onClose(); }}
          className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 flex items-center"
        >
          <ArchiveRestore className="h-4 w-4 mr-2 text-gray-500" />
          Unarchive
        </button>
      )}
      {isTrashed && (
        <button
          onClick={() => { onRestore(project.id); onClose(); }}
          className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 flex items-center"
        >
          <ArchiveRestore className="h-4 w-4 mr-2 text-gray-500" />
          Restore
        </button>
      )}
      <div className="border-t border-gray-200 my-1"></div>
      {!isTrashed ? (
        <button
          onClick={() => { onTrash(project.id); onClose(); }}
          className="w-full text-left px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 flex items-center"
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Move to Trash
        </button>
      ) : (
        <button
          onClick={() => { onDeletePermanently(project.id); onClose(); }}
          className="w-full text-left px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 flex items-center"
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Delete Permanently
        </button>
      )}
    </div>
  );
};
// --- End Project Context Menu Component ---

// NewProjectModal Component (Unchanged, assuming it works)
const NewProjectModal = ({ isOpen, onClose, userId }) => {
  const [title, setTitle] = useState("");
  const [template, setTemplate] = useState("blank");
  const [isCreating, setIsCreating] = useState(false);
  const router = useRouter();

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsCreating(true);

    try {
      // Create a new project in Firestore
      const projectRef = await addDoc(collection(db, "projects"), {
        title: title.trim(),
        owner: userId,
        template: template,
        createdAt: serverTimestamp(),
        lastModified: serverTimestamp(),
        archived: false,
        trashed: false
      });

      // Determine the correct collection name (handle inconsistency)
      const filesCollectionName = "projectFiles"; // Or "project_files" based on your final decision
      // Check if the collection exists or prefer one if unsure
      // For now, let's assume "projectFiles" is the target
      const filesCollectionRef = collection(db, filesCollectionName);


      // Create initial file (main.tex) in the determined collection
      await addDoc(filesCollectionRef, {
        projectId: projectRef.id,
        _name_: "main.tex", // Use _name_ consistently if possible
        name: "main.tex", // Add 'name' for compatibility
        type: "file",
        parentId: null,
        content: getTemplateContent(template),
        createdAt: serverTimestamp(),
        lastModified: serverTimestamp() // Add lastModified here too
        // Add ownerId if needed: ownerId: userId
      });

      // Navigate to the editor
      onClose(); // Close modal first
      router.push(`/editor/${projectRef.id}`);
    } catch (error) {
      console.error("Error creating project:", error);
      // TODO: Show error to user
      setIsCreating(false);
    }
    // No need for finally block to set isCreating to false here,
    // as navigation happens on success, unmounting the component.
  };

  // Function to get template content based on selection
  const getTemplateContent = (templateId) => {
    switch (templateId) {
      case "article":
        return `\\documentclass{article}
\\title{New Article}
\\author{Your Name}
\\date{\\today}

\\begin{document}
\\maketitle

\\section{Introduction}
Your introduction goes here.

\\section{Methods}
Your methods section goes here.

\\end{document}`;
      case "report":
        return `\\documentclass{report}
\\title{New Report}
\\author{Your Name}
\\date{\\today}

\\begin{document}
\\maketitle

\\chapter{Introduction}
Your introduction goes here.

\\chapter{Literature Review}
Your literature review goes here.

\\end{document}`;
      case "presentation":
        return `\\documentclass{beamer}
\\title{New Presentation}
\\author{Your Name}
\\date{\\today}

\\begin{document}

\\begin{frame}
\\titlepage
\\end{frame}

\\begin{frame}{Introduction}
Your introduction goes here.
\\end{frame}

\\end{document}`;
      default: // blank
        return `\\documentclass{article}
\\title{My Document}
\\author{Your Name}
\\date{\\today}

\\begin{document}
\\maketitle

\\section{Introduction}
Hello, world!

\\end{document}`;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-800">Create New Project</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 focus:outline-none"
            disabled={isCreating}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          <div className="mb-5">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Project Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Untitled Project"
              className="w-full px-4 py-2 text-gray-900 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 placeholder-gray-500"
              autoFocus
              disabled={isCreating}
            />
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Template
            </label>
            <div className="grid grid-cols-2 gap-3">
              {/* Blank */}
              <button
                type="button"
                onClick={() => setTemplate("blank")}
                disabled={isCreating}
                className={`p-3 border rounded-lg text-left transition-colors ${template === "blank"
                  ? "border-blue-500 bg-blue-50 text-gray-900 ring-1 ring-blue-500"
                  : "border-gray-300 hover:border-blue-300 hover:bg-blue-50/30 text-gray-900"
                  } ${isCreating ? 'cursor-not-allowed opacity-70' : ''}`}
              >
                <div className="flex items-center mb-1">
                  <FileText className="h-5 w-5 text-gray-800 mr-2" />
                  <div className="font-medium">Blank</div>
                </div>
                <div className="text-xs text-gray-700 ml-7">Start from scratch</div>
              </button>

              {/* Academic paper */}
              <button
                type="button"
                onClick={() => setTemplate("article")}
                disabled={isCreating}
                className={`p-3 border rounded-lg text-left transition-colors ${template === "article"
                  ? "border-blue-500 bg-blue-50 text-gray-900 ring-1 ring-blue-500"
                  : "border-gray-300 hover:border-blue-300 hover:bg-blue-50/30 text-gray-900"
                  } ${isCreating ? 'cursor-not-allowed opacity-70' : ''}`}
              >
                <div className="flex items-center mb-1">
                  <FileText className="h-5 w-5 text-gray-800 mr-2" />
                  <div className="font-medium">Academic paper</div>
                </div>
                <div className="text-xs text-gray-700 ml-7">Journal article</div>
              </button>

              {/* Formal report */}
              <button
                type="button"
                onClick={() => setTemplate("report")}
                disabled={isCreating}
                className={`p-3 border rounded-lg text-left transition-colors ${template === "report"
                  ? "border-blue-500 bg-blue-50 text-gray-900 ring-1 ring-blue-500"
                  : "border-gray-300 hover:border-blue-300 hover:bg-blue-50/30 text-gray-900"
                  } ${isCreating ? 'cursor-not-allowed opacity-70' : ''}`}
              >
                <div className="flex items-center mb-1">
                  <FileText className="h-5 w-5 text-gray-800 mr-2" />
                  <div className="font-medium">Formal report</div>
                </div>
                <div className="text-xs text-gray-700 ml-7">Longer document</div>
              </button>

              {/* Beamer slides */}
              <button
                type="button"
                onClick={() => setTemplate("presentation")}
                disabled={isCreating}
                className={`p-3 border rounded-lg text-left transition-colors ${template === "presentation"
                  ? "border-blue-500 bg-blue-50 text-gray-900 ring-1 ring-blue-500"
                  : "border-gray-300 hover:border-blue-300 hover:bg-blue-50/30 text-gray-900"
                  } ${isCreating ? 'cursor-not-allowed opacity-70' : ''}`}
              >
                <div className="flex items-center mb-1">
                  <FileText className="h-5 w-5 text-gray-800 mr-2" />
                  <div className="font-medium">Beamer slides</div>
                </div>
                <div className="text-xs text-gray-700 ml-7">Presentation</div>
              </button>
            </div>
          </div>

          <div className="flex justify-end space-x-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              disabled={isCreating}
              className="px-4 py-2 text-sm text-gray-700 hover:text-gray-900 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim() || isCreating}
              className={`px-4 py-2 text-sm text-white rounded-lg flex items-center justify-center transition-colors ${!title.trim() || isCreating
                ? "bg-blue-400 cursor-not-allowed"
                : "bg-blue-600 hover:bg-blue-700"
                }`}
            >
              {isCreating ? (
                <>
                  <Loader className="w-4 h-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Project"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};


// Project Card Component (Modified to add menu button handler)
const ProjectCard = ({ project, onClick, onMenuClick }) => { // Added onMenuClick
  const formattedDate = project.lastModified?.seconds
    ? new Date(project.lastModified.seconds * 1000).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
    : "Date unknown";

  // Get time since last modified
  const getTimeAgo = () => {
    if (!project.lastModified?.seconds) return "";
    const now = new Date();
    const lastModified = new Date(project.lastModified.seconds * 1000);
    const diffInSeconds = Math.floor((now.getTime() - lastModified.getTime()) / 1000); // Use getTime()

    if (diffInSeconds < 60) return "Just now";
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;

    return formattedDate;
  };

  return (
    <div
      className="bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden cursor-pointer group"
      onClick={onClick}
    >
      <div className="p-5">
        <div className="flex justify-between items-start mb-2">
          <div className="flex items-center min-w-0"> {/* Added min-w-0 */}
            <div className="bg-blue-100 rounded-md p-2 mr-3 flex-shrink-0">
              <FileText className="h-4 w-4 text-blue-600" />
            </div>
            <h3 className="font-medium text-gray-900 truncate group-hover:text-blue-600 transition-colors" title={project.title}>
              {project.title}
            </h3>
          </div>
          {/* --- Updated Menu Button --- */}
          <button
            onClick={(e) => {
              e.stopPropagation(); // Prevent card click
              onMenuClick(e, project.id); // Call passed handler
            }}
            className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-50 flex-shrink-0"
            title="Project options"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
          {/* --- End Updated Menu Button --- */}
        </div>

        <div className="mt-4 flex items-center justify-between text-xs text-gray-500">
          <div className="flex items-center">
            <Clock className="h-3 w-3 mr-1.5" />
            <span>{getTimeAgo()}</span>
          </div>
          <div className="flex items-center">
            <Users className="h-3 w-3 mr-1.5" />
            <span>
              {project.collaborators?.length || 1} user
              {(project.collaborators?.length || 0) > 0 ? "s" : ""}
            </span>
          </div>
        </div>
      </div>

      <div className="bg-gradient-to-r from-gray-50 to-gray-100 px-5 py-3 border-t border-gray-200 flex justify-between items-center">
        <div className="text-xs text-gray-500">
          {/* Check ownership based on userId */}
          {project.owner === "you" ? "Owner" : "Collaborator"}
        </div>
        <Link
          href={`/editor/${project.id}`}
          className="text-xs text-blue-600 hover:text-blue-800 flex items-center font-medium"
          onClick={(e) => e.stopPropagation()} // Prevent card click
        >
          Open <ExternalLink className="h-3 w-3 ml-1" />
        </Link>
      </div>
    </div>
  );
};


// Empty State Component (Unchanged)
const EmptyState = ({ onCreateNew }) => (
  <div className="text-center py-16 px-8 bg-white rounded-xl border border-gray-200 shadow-sm max-w-2xl mx-auto">
    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-5 rounded-full inline-flex mb-6 border border-blue-100">
      <FileText className="h-10 w-10 text-blue-500" />
    </div>
    <h3 className="text-xl font-semibold text-gray-800 mb-3">No projects yet</h3>
    <p className="text-gray-600 mb-8 max-w-md mx-auto">
      Create your first LaTeX document. {/* Simplified text */}
      Start writing beautiful papers, reports, and presentations.
    </p>
    <button
      onClick={onCreateNew}
      className="px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:from-blue-700 hover:to-indigo-700 shadow-sm flex items-center mx-auto"
    >
      <Plus className="h-4 w-4 mr-2" />
      Create New Project
    </button>
  </div>
);

// --- Main Dashboard Page ---
export default function DashboardPage() {
  const { user } = useUser();
  const { isLoaded: clerkIsLoaded } = useUser();
  const userId = user?.id || null;
  const router = useRouter();
  const { projects, loading: projectsLoading, error: projectsError, refreshProjects } = useProjects(userId); // Use hook's refresh

  // State
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState("grid");
  const [sortBy, setSortBy] = useState("lastModified");
  const [uiError, setUiError] = useState<string | null>(projectsError); // Initialize with hook error
  const [isComponentLoading, setIsComponentLoading] = useState(true); // Keep this for initial Clerk load
  const [sortOrder, setSortOrder] = useState("desc");
  const [currentSection, setCurrentSection] = useState("all");
  const [newProjectModalOpen, setNewProjectModalOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // State for Editor Loading
  const [isLoadingEditor, setIsLoadingEditor] = useState(false);
  const [loadingProjectId, setLoadingProjectId] = useState<string | null>(null);
  const [loadingProjectName, setLoadingProjectName] = useState<string | null>(null);
  const [currentLoadingStatusIndex, setCurrentLoadingStatusIndex] = useState(0);
  const loadingStatusTimerRef = useRef<NodeJS.Timeout | null>(null);

  // --- State for Project Context Menu ---
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    projectId: string | null;
  }>({ visible: false, x: 0, y: 0, projectId: null });
  // --- End Context Menu State ---

  const loadingStatuses = [
    "Initializing workspace...",
    "Authenticating your session...",
    "Loading project files...",
    "Preparing editor interface...",
    "Fetching assets...",
    "Almost there...",
  ];

  // Effect to handle initial component loading state based on Clerk
  useEffect(() => {
    if (clerkIsLoaded) {
      setIsComponentLoading(false); // Clerk auth state is known
      if (!userId) {
        setUiError("User not authenticated."); // Handle case where user is definitely not logged in
      }
    }
  }, [clerkIsLoaded, userId]);

  // Effect for loading status cycling (Unchanged)
  useEffect(() => {
    if (isLoadingEditor) {
      if (loadingStatusTimerRef.current) {
        clearInterval(loadingStatusTimerRef.current);
      }
      loadingStatusTimerRef.current = setInterval(() => {
        setCurrentLoadingStatusIndex((prevIndex) => (prevIndex + 1) % loadingStatuses.length);
      }, 1800);
    } else {
      if (loadingStatusTimerRef.current) {
        clearInterval(loadingStatusTimerRef.current);
        loadingStatusTimerRef.current = null;
      }
    }
    return () => {
      if (loadingStatusTimerRef.current) {
        clearInterval(loadingStatusTimerRef.current);
      }
    };
  }, [isLoadingEditor, loadingStatuses.length]); // Added dependency

  // Project click handler (Unchanged)
  const handleProjectClick = (projectId: string, projectName: string) => {
    if (isLoadingEditor) return;

    console.log(`Initiating navigation to editor for project: ${projectId}`);
    setLoadingProjectId(projectId);
    setLoadingProjectName(projectName);
    setCurrentLoadingStatusIndex(0);
    setIsLoadingEditor(true);

    setTimeout(() => {
      router.push(`/editor/${projectId}`);
    }, 100);
  };

  // Helper to format date (Unchanged)
  const formatDate = (date: any): string => {
    if (!date?.seconds) return 'N/A'; // Handle Firestore timestamp
    try {
      return new Date(date.seconds * 1000).toLocaleDateString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric',
        // hour: '2-digit', minute: '2-digit' // Removed time for brevity
      });
    } catch (e) {
      return 'Invalid Date';
    }
  }

  // --- Project Action Handlers ---
  const handleRenameProject = async (projectId: string, currentName: string) => {
    const newName = prompt("Enter new project name:", currentName);
    if (!newName || newName.trim() === "" || newName === currentName) {
      setContextMenu({ visible: false, x: 0, y: 0, projectId: null }); // Close menu if cancelled
      return;
    }
    try {
      await updateDoc(doc(db, "projects", projectId), {
        title: newName.trim(),
        lastModified: serverTimestamp()
      });
      showNotification("Project renamed successfully!");
      refreshProjects(); // Refresh list
    } catch (error) {
      console.error("Error renaming project:", error);
      showNotification("Failed to rename project.", "error");
    } finally {
      setContextMenu({ visible: false, x: 0, y: 0, projectId: null });
    }
  };

  const handleArchiveProject = async (projectId: string) => {
    try {
      await updateDoc(doc(db, "projects", projectId), {
        archived: true,
        trashed: false, // Ensure it's not in trash
        lastModified: serverTimestamp()
      });
      showNotification("Project archived.");
      refreshProjects();
    } catch (error) {
      console.error("Error archiving project:", error);
      showNotification("Failed to archive project.", "error");
    } finally {
      setContextMenu({ visible: false, x: 0, y: 0, projectId: null });
    }
  };

  const handleUnarchiveProject = async (projectId: string) => {
    try {
      await updateDoc(doc(db, "projects", projectId), {
        archived: false,
        lastModified: serverTimestamp()
      });
      showNotification("Project unarchived.");
      refreshProjects();
    } catch (error) {
      console.error("Error unarchiving project:", error);
      showNotification("Failed to unarchive project.", "error");
    } finally {
      setContextMenu({ visible: false, x: 0, y: 0, projectId: null });
    }
  };


  const handleTrashProject = async (projectId: string) => {
    try {
      await updateDoc(doc(db, "projects", projectId), {
        trashed: true,
        archived: false, // Ensure it's not archived
        lastModified: serverTimestamp()
      });
      showNotification("Project moved to trash.");
      refreshProjects();
    } catch (error) {
      console.error("Error moving project to trash:", error);
      showNotification("Failed to move project to trash.", "error");
    } finally {
      setContextMenu({ visible: false, x: 0, y: 0, projectId: null });
    }
  };

  const handleRestoreProject = async (projectId: string) => {
    try {
      await updateDoc(doc(db, "projects", projectId), {
        trashed: false,
        lastModified: serverTimestamp()
      });
      showNotification("Project restored from trash.");
      refreshProjects();
    } catch (error) {
      console.error("Error restoring project:", error);
      showNotification("Failed to restore project.", "error");
    } finally {
      setContextMenu({ visible: false, x: 0, y: 0, projectId: null });
    }
  };

  const handleDeletePermanently = async (projectId: string) => {
    if (!window.confirm("Are you sure you want to permanently delete this project and all its files? This action cannot be undone.")) {
      setContextMenu({ visible: false, x: 0, y: 0, projectId: null });
      return;
    }
    try {
      // TODO: Add logic to delete associated projectFiles
      // This requires querying for files with matching projectId and deleting them (potentially in a batch)
      // Example query (adapt collection name):
      // const filesQuery = query(collection(db, "projectFiles"), where("projectId", "==", projectId));
      // const filesSnapshot = await getDocs(filesQuery);
      // const batch = writeBatch(db);
      // filesSnapshot.forEach(doc => batch.delete(doc.ref));
      // await batch.commit();

      // Delete the project document itself
      await deleteDoc(doc(db, "projects", projectId));
      showNotification("Project permanently deleted.");
      refreshProjects();
    } catch (error) {
      console.error("Error permanently deleting project:", error);
      showNotification("Failed to permanently delete project.", "error");
    } finally {
      setContextMenu({ visible: false, x: 0, y: 0, projectId: null });
    }
  };

  // Helper to show notifications (optional, replace with your preferred method)
  const showNotification = (message: string, type: "success" | "error" = "success") => {
    // Replace with your actual notification implementation (e.g., react-toastify)
    console.log(`Notification (${type}): ${message}`);
    alert(`Notification (${type}): ${message}`); // Simple alert for now
  };

  // Trigger context menu
  const handleProjectMenuClick = (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation(); // Prevent card/row click
    setContextMenu({
      visible: true,
      // Adjust position slightly away from cursor
      x: e.clientX + 5,
      y: e.clientY + 5,
      projectId: projectId
    });
  };
  // --- End Project Action Handlers ---

  // Initial loading state for Clerk auth
  if (isComponentLoading) { // Use the state derived from clerkIsLoaded
    return (
      <div className="flex h-screen items-center justify-center bg-gray-100">
        <Loader className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  // Editor Loading Screen
  if (isLoadingEditor) {
    return (
      <EditorLoadingScreen
        projectName={loadingProjectName}
        status={loadingStatuses[currentLoadingStatusIndex]}
      />
    );
  }

  // Filter and sort projects (considering archived/trashed status)
  const filteredProjects = projects.filter((project: Project) => {
    const matchesSearch = project.title
      .toLowerCase()
      .includes(searchQuery.toLowerCase());

    let matchesSection = false;
    switch (currentSection) {
      case "all":
        matchesSection = !project.archived && !project.trashed;
        break;
      case "owned":
        // Assuming useProjects hook provides correct ownership info or `project.owner` field exists
        matchesSection = project.owner === userId && !project.archived && !project.trashed;
        break;
      case "shared":
        // Assuming useProjects provides correct collaborator info or `project.collaborators` field exists
        matchesSection = project.collaborators?.includes(userId) && project.owner !== userId && !project.archived && !project.trashed;
        break;
      case "archived":
        matchesSection = !!project.archived && !project.trashed; // Ensure archived flag is explicitly true
        break;
      case "trash":
        matchesSection = !!project.trashed; // Ensure trashed flag is explicitly true
        break;
      default:
        matchesSection = !project.archived && !project.trashed;
    }

    return matchesSearch && matchesSection;
  });

  // Sort projects (Improved Date Handling)
  const sortedProjects = [...filteredProjects].sort((a, b) => {
    const dateA = a.lastModified?.seconds ? new Date(a.lastModified.seconds * 1000).getTime() : 0;
    const dateB = b.lastModified?.seconds ? new Date(b.lastModified.seconds * 1000).getTime() : 0;

    if (sortBy === "lastModified") {
      return sortOrder === "desc" ? dateB - dateA : dateA - dateB;
    } else if (sortBy === "title") {
      return sortOrder === "desc"
        ? b.title.localeCompare(a.title)
        : a.title.localeCompare(b.title);
    }
    return 0;
  });

  // Get section name for display (Unchanged)
  const getSectionName = () => {
    switch (currentSection) {
      case "all": return "All Projects";
      case "owned": return "Your Projects";
      case "shared": return "Shared with you";
      case "archived": return "Archived Projects";
      case "trash": return "Trash";
      default: return "Projects";
    }
  };

  // Sidebar component (Modified project name)
  const Sidebar = ({ mobile = false }) => (
    <aside className={`${mobile ? 'fixed inset-0 z-40 transform transition-transform duration-300 lg:hidden' : 'hidden lg:flex'} ${mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'} flex-col w-64 bg-white border-r border-gray-100 h-full shadow-sm`}>
      {mobile && (
        <div className="absolute top-0 right-0 p-4 z-50">
          <button onClick={() => setMobileSidebarOpen(false)} className="text-gray-500 hover:text-gray-700 cursor-pointer">
            <X className="h-6 w-6" />
          </button>
        </div>
      )}

      <div className="p-5 flex items-center border-b border-gray-100">
        <Link href="/dashboard" className="flex items-center cursor-pointer group">
          {/* Consider a Kepler-specific icon if desired */}
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center text-white mr-3 shadow-sm group-hover:scale-105 transition-transform">
            <Command className="h-5 w-5" />
          </div>
          {/* --- Project Name Changed --- */}
          <span className="font-bold text-xl text-gray-900 tracking-tight group-hover:text-indigo-700 transition-colors">Kepler</span>
        </Link>
      </div>

      <div className="px-4 py-5">
        <button
          onClick={() => {
            setNewProjectModalOpen(true);
            if (mobile) setMobileSidebarOpen(false);
          }}
          className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white py-2.5 px-4 rounded-xl flex items-center justify-center transition-all duration-200 shadow-sm hover:shadow cursor-pointer"
        >
          <Plus className="h-4 w-4 mr-2" />
          <span className="font-medium">New Project</span>
        </button>
      </div>

      <nav className="flex-1 px-3 py-2 overflow-y-auto">
        <ul className="space-y-1.5">
          <li>
            <button
              onClick={() => { setCurrentSection("all"); if (mobile) setMobileSidebarOpen(false); }}
              className={`w-full text-left py-2.5 px-4 rounded-xl flex items-center transition-all duration-200 cursor-pointer ${currentSection === "all"
                ? "bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-700 font-medium"
                : "text-gray-700 hover:bg-gray-50"
                }`}
            >
              <FileText className={`h-5 w-5 mr-3 ${currentSection === "all" ? "text-blue-500" : "text-gray-500"}`} />
              <span>All Projects</span>
            </button>
          </li>
          <li>
            <button
              onClick={() => { setCurrentSection("owned"); if (mobile) setMobileSidebarOpen(false); }}
              className={`w-full text-left py-2.5 px-4 rounded-xl flex items-center transition-all duration-200 cursor-pointer ${currentSection === "owned"
                ? "bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-700 font-medium"
                : "text-gray-700 hover:bg-gray-50"
                }`}
            >
              <FolderOpen className={`h-5 w-5 mr-3 ${currentSection === "owned" ? "text-blue-500" : "text-gray-500"}`} />
              <span>Your Projects</span>
            </button>
          </li>
          <li>
            <button
              onClick={() => { setCurrentSection("shared"); if (mobile) setMobileSidebarOpen(false); }}
              className={`w-full text-left py-2.5 px-4 rounded-xl flex items-center transition-all duration-200 cursor-pointer ${currentSection === "shared"
                ? "bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-700 font-medium"
                : "text-gray-700 hover:bg-gray-50"
                }`}
            >
              <Share2 className={`h-5 w-5 mr-3 ${currentSection === "shared" ? "text-blue-500" : "text-gray-500"}`} />
              <span>Shared with you</span>
            </button>
          </li>
          <li>
            <button
              onClick={() => { setCurrentSection("archived"); if (mobile) setMobileSidebarOpen(false); }}
              className={`w-full text-left py-2.5 px-4 rounded-xl flex items-center transition-all duration-200 cursor-pointer ${currentSection === "archived"
                ? "bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-700 font-medium"
                : "text-gray-700 hover:bg-gray-50"
                }`}
            >
              <Archive className={`h-5 w-5 mr-3 ${currentSection === "archived" ? "text-blue-500" : "text-gray-500"}`} />
              <span>Archived</span>
            </button>
          </li>
          <li>
            <button
              onClick={() => { setCurrentSection("trash"); if (mobile) setMobileSidebarOpen(false); }}
              className={`w-full text-left py-2.5 px-4 rounded-xl flex items-center transition-all duration-200 cursor-pointer ${currentSection === "trash"
                ? "bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-700 font-medium"
                : "text-gray-700 hover:bg-gray-50"
                }`}
            >
              <Trash2 className={`h-5 w-5 mr-3 ${currentSection === "trash" ? "text-blue-500" : "text-gray-500"}`} />
              <span>Trash</span>
            </button>
          </li>
        </ul>
      </nav>

      <div className="p-4 mt-auto border-t border-gray-100">
        <div className="flex items-center">
          {/* --- Clerk UserButton --- */}
          <UserButton afterSignOutUrl="/" appearance={{ elements: { userButtonAvatarBox: "w-9 h-9", userButtonPopoverCard: "z-50" } }} />
          {/* --- End Clerk UserButton --- */}
          <div className="ml-3 flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">
              {user?.fullName || user?.firstName || 'User'}
            </p>
            <p className="text-xs text-gray-500 truncate">
              {user?.primaryEmailAddress?.emailAddress || 'No email'}
            </p>
          </div>
        </div>
      </div>
    </aside>
  );

  return (
    <div className="min-h-screen bg-gray-50 flex overflow-hidden">
      {/* Mobile Sidebar Backdrop */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/20 backdrop-blur-sm z-30 lg:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}
      {/* Mobile Sidebar */}
      <Sidebar mobile={true} />

      {/* Desktop Sidebar */}
      <Sidebar />

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="bg-white border-b border-gray-100 py-4 px-6 flex justify-between items-center flex-shrink-0">
          <div className="flex items-center">
            <button
              onClick={() => setMobileSidebarOpen(true)}
              className="lg:hidden mr-4 text-gray-500 hover:text-gray-600"
            >
              <Menu className="h-6 w-6" />
            </button>
            <h1 className="text-xl font-semibold text-gray-800 hidden sm:block">
              {getSectionName()}
            </h1>
          </div>
          <div className="flex items-center space-x-3">
            <div className="relative hidden md:block">
              <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                <Search className="h-4 w-4 text-gray-400" />
              </div>
              <input
                type="text"
                className="pl-10 pr-4 py-2 text-gray-900 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent w-64 text-sm placeholder-gray-500"
                placeholder="Search projects..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="flex border border-gray-200 rounded-lg overflow-hidden shadow-sm">
              <button
                className={`p-2 transition-colors duration-150 ${viewMode === "grid" ? "bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-600 border-r border-gray-200" : "text-gray-500 hover:bg-gray-50"}`}
                onClick={() => setViewMode("grid")} title="Grid view">
                <Grid className="h-5 w-5" />
              </button>
              <button
                className={`p-2 transition-colors duration-150 ${viewMode === "list" ? "bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-600" : "text-gray-500 hover:bg-gray-50"}`}
                onClick={() => setViewMode("list")} title="List view">
                <List className="h-5 w-5" />
              </button>
            </div>
          </div>
        </header>

        {/* Search bar for mobile */}
        <div className="px-4 py-2 bg-white border-b border-gray-100 md:hidden flex-shrink-0">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
              <Search className="h-4 w-4 text-gray-400" />
            </div>
            <input
              type="text"
              className="w-full pl-10 pr-4 py-2 text-gray-900 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm placeholder-gray-500"
              placeholder="Search projects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Main content area with projects */}
        <main className="flex-1 overflow-y-auto p-6 bg-gray-50">
          <div className="flex flex-wrap justify-between items-center mb-6 gap-4">
            <h2 className="text-lg font-medium text-gray-800">
              {getSectionName()}
              <span className="text-gray-500 text-sm font-normal ml-2">
                ({sortedProjects.length})
              </span>
            </h2>
            <div className="flex items-center space-x-3">
              {/* Show "Create New" on mobile */}
              <button
                onClick={() => setNewProjectModalOpen(true)}
                className={`lg:hidden inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md shadow text-sm transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-50 focus:ring-blue-500`}
              >
                <Plus className="h-4 w-4 mr-1" />
                New
              </button>
              <button
                onClick={() => setSortOrder((prev) => (prev === "desc" ? "asc" : "desc"))}
                className="flex items-center text-sm text-gray-600 hover:text-gray-900 bg-white border border-gray-200 rounded-lg px-3 py-1.5 shadow-sm hover:shadow transition-all"
              >
                <Calendar className="h-4 w-4 mr-2" />
                <span className="hidden sm:inline">Sort by Date</span>
                <ChevronDown className={`h-4 w-4 ml-1 sm:ml-2 transition-transform ${sortOrder === "asc" ? "transform rotate-180" : ""}`} />
              </button>
            </div>
          </div>

          {/* Loading / Error / Empty / Projects */}
          {projectsLoading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-6"></div>
              <p className="text-gray-600 text-lg">Loading your projects...</p>
            </div>
          ) : uiError ? (
            <div className="bg-gradient-to-br from-red-50 to-pink-50 border border-red-100 rounded-xl p-8 text-center max-w-2xl mx-auto shadow-sm">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="h-8 w-8 text-red-500" />
              </div>
              <h3 className="text-xl font-medium text-red-800 mb-3">Error loading projects</h3>
              <p className="text-red-600 mb-6">{uiError}</p>
              <button
                onClick={refreshProjects} // Use refresh from hook
                className="px-6 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 shadow-sm flex items-center mx-auto"
              >
                <Loader className="animate-spin -ml-1 mr-3 h-4 w-4 text-white" />
                Try Again
              </button>
            </div>
          ) : sortedProjects.length === 0 ? (
            <EmptyState onCreateNew={() => setNewProjectModalOpen(true)} />
          ) : viewMode === "grid" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {sortedProjects.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  onClick={() => handleProjectClick(project.id, project.title)}
                  onMenuClick={handleProjectMenuClick} // Pass menu handler
                />
              ))}
            </div>
          ) : (
            // List View Table
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gradient-to-r from-gray-50 to-gray-100">
                  <tr>
                    <th scope="col" className="px-6 py-3.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Project Name</th>
                    <th scope="col" className="px-6 py-3.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">Last Modified</th>
                    <th scope="col" className="px-6 py-3.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden lg:table-cell">Status</th>
                    <th scope="col" className="relative px-6 py-3.5"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {sortedProjects.map((project, index) => (
                    <tr
                      key={project.id}
                      className={`hover:bg-blue-50/60 cursor-pointer transition-colors ${index % 2 === 0 ? "bg-white" : "bg-gray-50/50"}`}
                      onClick={() => handleProjectClick(project.id, project.title)} // Main row click navigates
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="bg-blue-100 rounded-md p-2 mr-3 hidden sm:flex flex-shrink-0">
                            <FileText className="h-4 w-4 text-blue-600" />
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium text-gray-900 truncate" title={project.title}>
                              {project.title}
                            </div>
                            <div className="text-xs text-gray-500 md:hidden">
                              {formatDate(project.lastModified)}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 hidden md:table-cell">
                        {formatDate(project.lastModified)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm hidden lg:table-cell">
                        {project.archived ? (<span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs font-medium">Archived</span>)
                          : project.trashed ? (<span className="px-2 py-1 bg-red-100 text-red-800 rounded-full text-xs font-medium">Trashed</span>)
                            : (<span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">Active</span>)
                        }
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex items-center justify-end space-x-1">
                          {/* --- Updated Menu Button --- */}
                          <button
                            onClick={(e) => handleProjectMenuClick(e, project.id)} // Trigger menu
                            className="text-gray-400 hover:text-blue-600 p-1.5 hover:bg-blue-50 rounded-full transition-all"
                            title="Project options"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                          {/* --- End Updated Menu Button --- */}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </main>
      </div>

      {/* --- Project Context Menu Instance --- */}
      <ProjectContextMenu
        isOpen={contextMenu.visible}
        x={contextMenu.x}
        y={contextMenu.y}
        project={projects.find(p => p.id === contextMenu.projectId)} // Find project details
        onClose={() => setContextMenu({ visible: false, x: 0, y: 0, projectId: null })}
        onRename={handleRenameProject}
        onArchive={handleArchiveProject}
        onTrash={handleTrashProject}
        onUnarchive={handleUnarchiveProject}
        onRestore={handleRestoreProject}
        onDeletePermanently={handleDeletePermanently}
      />
      {/* --- End Project Context Menu Instance --- */}

      {/* Modals */}
      {newProjectModalOpen && (
        <NewProjectModal
          isOpen={newProjectModalOpen}
          onClose={() => setNewProjectModalOpen(false)}
          userId={userId}
        />
      )}
    </div>
  );
}

// --- END OF UPDATED FILE page.tsx ---