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
  serverTimestamp
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useProjects } from "../../hooks/useProjects";

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
  Command,
  TrendingUp,
  Menu,
  X
} from "lucide-react";

// NewProjectModal Component
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

      // Create initial file (main.tex)
      await addDoc(collection(db, "projectFiles"), {
        projectId: projectRef.id,
        name: "main.tex",
        _name_: "main.tex",
        type: "file",
        parentId: null,
        content: getTemplateContent(template),
        createdAt: serverTimestamp(),
        lastModified: serverTimestamp()
      });

      // Navigate to the editor
      router.push(`/editor/${projectRef.id}`);
    } catch (error) {
      console.error("Error creating project:", error);
      setIsCreating(false);
    }
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-800">Create New Project</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 focus:outline-none"
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
                className={`p-3 border rounded-lg text-left ${
                  template === "blank"
                    ? "border-blue-500 bg-blue-50 text-gray-900"
                    : "border-gray-300 hover:border-blue-300 hover:bg-blue-50/30 text-gray-900"
                }`}
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
                className={`p-3 border rounded-lg text-left ${
                  template === "article"
                    ? "border-blue-500 bg-blue-50 text-gray-900"
                    : "border-gray-300 hover:border-blue-300 hover:bg-blue-50/30 text-gray-900"
                }`}
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
                className={`p-3 border rounded-lg text-left ${
                  template === "report"
                    ? "border-blue-500 bg-blue-50 text-gray-900"
                    : "border-gray-300 hover:border-blue-300 hover:bg-blue-50/30 text-gray-900"
                }`}
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
                className={`p-3 border rounded-lg text-left ${
                  template === "presentation"
                    ? "border-blue-500 bg-blue-50 text-gray-900"
                    : "border-gray-300 hover:border-blue-300 hover:bg-blue-50/30 text-gray-900"
                }`}
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
              className="px-4 py-2 text-sm text-gray-700 hover:text-gray-900 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim() || isCreating}
              className={`px-4 py-2 text-sm text-white rounded-lg ${
                !title.trim() || isCreating
                  ? "bg-blue-400 cursor-not-allowed"
                  : "bg-blue-600 hover:bg-blue-700"
              }`}
            >
              {isCreating ? (
                <div className="flex items-center">
                  <Loader className="w-4 h-4 mr-2 animate-spin" />
                  Creating...
                </div>
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

// Project Card Component
const ProjectCard = ({ project, onClick }) => {
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
    const diffInSeconds = Math.floor((now - lastModified) / 1000);

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
          <div className="flex items-center">
            <div className="bg-blue-100 rounded-md p-2 mr-3">
              <FileText className="h-4 w-4 text-blue-600" />
            </div>
            <h3 className="font-medium text-gray-900 truncate group-hover:text-blue-600 transition-colors">
              {project.title}
            </h3>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              // Handle project menu
            }}
            className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-50"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
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
          {project.owner === "you" ? "Owner" : "Collaborator"}
        </div>
        <Link
          href={`/editor/${project.id}`}
          className="text-xs text-blue-600 hover:text-blue-800 flex items-center font-medium"
          onClick={(e) => e.stopPropagation()}
        >
          Open <ExternalLink className="h-3 w-3 ml-1" />
        </Link>
      </div>
    </div>
  );
};

// Empty State Component
const EmptyState = ({ onCreateNew }) => (
  <div className="text-center py-16 px-8 bg-white rounded-xl border border-gray-200 shadow-sm max-w-2xl mx-auto">
    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-5 rounded-full inline-flex mb-6 border border-blue-100">
      <FileText className="h-10 w-10 text-blue-500" />
    </div>
    <h3 className="text-xl font-semibold text-gray-800 mb-3">No projects yet</h3>
    <p className="text-gray-600 mb-8 max-w-md mx-auto">
      Create your first LaTeX document to experience the power of LaTeX Scholar.
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

export default function DashboardPage() {
  const { user } = useUser();
  const { isLoaded: clerkIsLoaded } = useUser();
  const userId = user?.id || null;
  const router = useRouter();
  const { projects, loading: projectsLoading, error: projectsError } = useProjects(userId); 

  // State
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState("grid");
  const [sortBy, setSortBy] = useState("lastModified");
  const [uiError, setUiError] = useState<string | null>(null);
  const [isComponentLoading, setIsComponentLoading] = useState(true);
  const [sortOrder, setSortOrder] = useState("desc");
  const [currentSection, setCurrentSection] = useState("all");
  const [newProjectModalOpen, setNewProjectModalOpen] = useState(false);
  const [ setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // --- State for Editor Loading ---
  const [isLoadingEditor, setIsLoadingEditor] = useState(false);
  const [loadingProjectId, setLoadingProjectId] = useState<string | null>(null);
  const [loadingProjectName, setLoadingProjectName] = useState<string | null>(null);
  const [currentLoadingStatusIndex, setCurrentLoadingStatusIndex] = useState(0);
  const loadingStatusTimerRef = useRef<NodeJS.Timeout | null>(null);


  const { refreshProjects: refreshProjectsFromHook } = useProjects(userId);
  const refreshProjects = () => {
    console.log("Refreshing projects via hook...");
    refreshProjectsFromHook(); // Call the function from the hook
  };
  

  const loadingStatuses = [
    "Initializing workspace...",
    "Authenticating your session...",
    "Loading project files...",
    "Preparing editor interface...",
    "Fetching assets...",
    "Almost there...",
  ];


  // Fetch projects effect
  useEffect(() => {
    const fetchProjects = async () => {
      if (clerkIsLoaded) {
        setIsComponentLoading(false); // Component is ready once Clerk auth is loaded
        if (!userId) {
            setUiError("User not authenticated."); // Use the local UI error state
        }
    }

      setIsLoading(true);
      setUiError(null);

      try {
        await authenticateWithFirebase(userId); // Ensure Firebase auth sync
        console.log("Firebase authenticated, fetching projects for user:", userId);

        const projectsRef = collection(db, 'projects');
        const q = query(
          projectsRef,
          where('ownerId', '==', userId),
          orderBy('lastModified', 'desc') // Order by last modified
        );

        const querySnapshot = await getDocs(q);
        const userProjects: Project[] = [];

        querySnapshot.forEach((doc) => {
          const data = doc.data();
          // Convert Firestore Timestamps to JS Date objects
          const lastModified = data.lastModified?.toDate ? data.lastModified.toDate() : null;
          const createdAt = data.createdAt?.toDate ? data.createdAt.toDate() : null;

          userProjects.push({
            id: doc.id,
            title: data.title || 'Untitled Project',
            description: data.description || '',
            lastModified,
            createdAt,
          });
        });

        await refreshProjects();
        console.log("Fetched projects:", userProjects.length);
      } catch (err: any) {
        console.error("Error fetching projects:", err);
        setUiError(`Failed to load projects: ${err.message || 'Unknown error'}`);
      } finally {
        setIsLoading(false);
      }
    };

    if (clerkIsLoaded && userId) {
      fetchProjects();
    } else if (clerkIsLoaded && !userId) {
      setUiError("User not authenticated.");
        setIsLoading(false);
    }
  }, [userId, clerkIsLoaded]);

  // Effect for loading status cycling
  useEffect(() => {
    if (isLoadingEditor) {
      // Clear any existing timer
      if (loadingStatusTimerRef.current) {
        clearInterval(loadingStatusTimerRef.current);
      }
      // Start new timer
      loadingStatusTimerRef.current = setInterval(() => {
        setCurrentLoadingStatusIndex((prevIndex) => (prevIndex + 1) % loadingStatuses.length);
      }, 1800); // Change status every 1.8 seconds
    } else {
      // Clear timer if loading stops
      if (loadingStatusTimerRef.current) {
        clearInterval(loadingStatusTimerRef.current);
        loadingStatusTimerRef.current = null;
      }
    }

    // Cleanup timer on component unmount
    return () => {
      if (loadingStatusTimerRef.current) {
        clearInterval(loadingStatusTimerRef.current);
      }
    };
  }, [isLoadingEditor]); // Rerun only when isLoadingEditor changes


  const handleCreateProject = async () => {
    if (!userId) {
      setUiError("Cannot create project: User not authenticated.");
      return;
    }
    setIsLoading(true); // Indicate loading

    const newProject = {
      title: 'Untitled LaTeX Project',
      description: 'A new LaTeX Scholar project.',
      ownerId: userId,
      createdAt: serverTimestamp(),
      lastModified: serverTimestamp(),
    };

    try {
      await authenticateWithFirebase(userId); // Ensure Firebase auth
      const docRef = await addDoc(collection(db, 'projects'), newProject);
      console.log("Project created with ID: ", docRef.id);
      
      // Optionally navigate to the new project editor immediately
      await refreshProjects();
      console.log("Called refreshProjects after creation.");
      handleProjectClick(docRef.id, newProject.title);

    } catch (err: any) {
      console.error("Error creating project:", err);
      setUiError(`Failed to create project: ${err.message || 'Unknown error'}`);
    } finally {
       setIsLoading(false); // Stop global loading indicator if you added one
    }
  };

  // --- Modified Project Click Handler ---
  const handleProjectClick = (projectId: string, projectName: string) => {
    if (isLoadingEditor) return; // Prevent multiple clicks

    console.log(`Initiating navigation to editor for project: ${projectId}`);
    setLoadingProjectId(projectId);
    setLoadingProjectName(projectName);
    setCurrentLoadingStatusIndex(0); // Start from the first status
    setIsLoadingEditor(true); // Activate loading screen

    // Delay the actual navigation slightly to allow the loading screen to render
    // Adjust delay as needed, but keep it short
    setTimeout(() => {
      router.push(`/editor/${projectId}`);
      // Keep isLoadingEditor true; the screen will disappear when the component unmounts during navigation
    }, 100);
  };
  // --- End Modified Handler ---

  // Helper to format date
  const formatDate = (date: Date | null): string => {
      if (!date) return 'N/A';
      try {
        // More user-friendly format
        return date.toLocaleDateString(undefined, {
            year: 'numeric', month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
      } catch (e) {
        return 'Invalid Date';
      }
  }

  // Initial loading state for Clerk auth
  if (!clerkIsLoaded) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-900">
        <Loader className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

   // --- Render Loading Screen ---
  if (isLoadingEditor) {
    return (
      <EditorLoadingScreen
        projectName={loadingProjectName}
        status={loadingStatuses[currentLoadingStatusIndex]}
      />
    );
  }
  // --- End Loading Screen Render ---

  // Filter and sort projects
  const filteredProjects = projects.filter((project) => {
    const matchesSearch = project.title
      .toLowerCase()
      .includes(searchQuery.toLowerCase());
    const matchesSection =
      currentSection === "all" ||
      (currentSection === "owned" && project.owner === userId) ||
      (currentSection === "shared" && project.collaborators?.includes(userId)) ||
      (currentSection === "archived" && project.archived) ||
      (currentSection === "trash" && project.trashed);

    return matchesSearch && matchesSection;
  });

  // Sort projects
  const sortedProjects = [...filteredProjects].sort((a, b) => {
    const dateA = a.lastModified?.seconds
      ? new Date(a.lastModified.seconds * 1000)
      : new Date(0);
    const dateB = b.lastModified?.seconds
      ? new Date(b.lastModified.seconds * 1000)
      : new Date(0);

    if (sortBy === "lastModified") {
      return sortOrder === "desc" ? dateB - dateA : dateA - dateB;
    } else if (sortBy === "title") {
      return sortOrder === "desc"
        ? b.title.localeCompare(a.title)
        : a.title.localeCompare(b.title);
    }
    return 0;
  });

  // Get section name for display
  const getSectionName = () => {
    switch (currentSection) {
      case "all":
        return "All Projects";
      case "owned":
        return "Your Projects";
      case "shared":
        return "Shared Projects";
      case "archived":
        return "Archived Projects";
      case "trash":
        return "Trash";
      default:
        return "Projects";
    }
  };

  // Sidebar component
  const Sidebar = ({ mobile = false }) => (
    <aside className={`${mobile ? 'fixed inset-0 z-40 transform transition-transform duration-300 lg:hidden' : 'hidden lg:flex'} ${mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'} flex-col w-64 bg-white border-r border-gray-100 h-full`}>
      {mobile && (
        <div className="absolute top-0 right-0 p-4">
          <button onClick={() => setMobileSidebarOpen(false)} className="text-gray-500 hover:text-gray-700 cursor-pointer">
            <X className="h-6 w-6" />
          </button>
        </div>
      )}
      
      <div className="p-5 flex items-center border-b border-gray-100">
        <Link href="/dashboard" className="flex items-center cursor-pointer">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center text-white mr-3 shadow-sm">
            <Command className="h-5 w-5" />
          </div>
          <span className="font-bold text-xl text-gray-900 tracking-tight">LaTeX Scholar</span>
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
              onClick={() => {
                setCurrentSection("all");
                if (mobile) setMobileSidebarOpen(false);
              }}
              className={`w-full text-left py-2.5 px-4 rounded-xl flex items-center transition-all duration-200 cursor-pointer ${
                currentSection === "all" 
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
              onClick={() => {
                setCurrentSection("owned");
                if (mobile) setMobileSidebarOpen(false);
              }}
              className={`w-full text-left py-2.5 px-4 rounded-xl flex items-center transition-all duration-200 cursor-pointer ${
                currentSection === "owned" 
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
              onClick={() => {
                setCurrentSection("shared");
                if (mobile) setMobileSidebarOpen(false);
              }}
              className={`w-full text-left py-2.5 px-4 rounded-xl flex items-center transition-all duration-200 cursor-pointer ${
                currentSection === "shared" 
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
              onClick={() => {
                setCurrentSection("archived");
                if (mobile) setMobileSidebarOpen(false);
              }}
              className={`w-full text-left py-2.5 px-4 rounded-xl flex items-center transition-all duration-200 cursor-pointer ${
                currentSection === "archived" 
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
              onClick={() => {
                setCurrentSection("trash");
                if (mobile) setMobileSidebarOpen(false);
              }}
              className={`w-full text-left py-2.5 px-4 rounded-xl flex items-center transition-all duration-200 cursor-pointer ${
                currentSection === "trash" 
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
          <UserButton afterSignOutUrl="/" />
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
      {/* Mobile Sidebar - Assuming Sidebar component handles its own visibility logic based on mobileSidebarOpen state passed to it or via context */}
      {mobileSidebarOpen && <Sidebar mobile={true} />}

      {/* Desktop Sidebar */}
      <Sidebar />

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="bg-white border-b border-gray-100 py-4 px-6 flex justify-between items-center flex-shrink-0"> {/* Added flex-shrink-0 */}
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
                className={`p-2 transition-colors duration-150 ${
                  viewMode === "grid"
                    ? "bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-600 border-r border-gray-200"
                    : "text-gray-500 hover:bg-gray-50"
                }`}
                onClick={() => setViewMode("grid")}
                title="Grid view"
              >
                <Grid className="h-5 w-5" />
              </button>
              <button
                className={`p-2 transition-colors duration-150 ${
                  viewMode === "list"
                    ? "bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-600"
                    : "text-gray-500 hover:bg-gray-50"
                }`}
                onClick={() => setViewMode("list")}
                title="List view"
              >
                <List className="h-5 w-5" />
              </button>
            </div>
          </div>
        </header>

        {/* Search bar for mobile */}
        <div className="px-4 py-2 bg-white border-b border-gray-100 md:hidden flex-shrink-0"> {/* Added flex-shrink-0 */}
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
        <main className="flex-1 overflow-y-auto p-6 bg-gray-50"> {/* Added bg-gray-50 */}
          {/* Section title and sorting options */}
          <div className="flex flex-wrap justify-between items-center mb-6 gap-4"> {/* Added flex-wrap and gap */}
            <h2 className="text-lg font-medium text-gray-800">
              {getSectionName()} {/* Always show title */}
              <span className="text-gray-500 text-sm font-normal ml-2">
                ({sortedProjects.length})
              </span>
            </h2>

            <div className="flex items-center space-x-3"> {/* Group sort/create buttons */}
                 {/* Moved New Project button here for mobile/smaller screens */}
                 <button
                    onClick={handleCreateProject}
                    disabled={isLoading}
                    className={`lg:hidden inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md shadow text-sm transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-50 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed`}
                 >
                     <Plus className="h-4 w-4 mr-1" />
                     New
                 </button>
                 <button
                    onClick={() => { setSortOrder((prev) => (prev === "desc" ? "asc" : "desc")); }}
                    className="flex items-center text-sm text-gray-600 hover:text-gray-900 bg-white border border-gray-200 rounded-lg px-3 py-1.5 shadow-sm hover:shadow transition-all"
                 >
                    <Calendar className="h-4 w-4 mr-2" />
                    <span className="hidden sm:inline">Sort by Date</span>
                    <ChevronDown
                    className={`h-4 w-4 ml-1 sm:ml-2 transition-transform ${
                        sortOrder === "asc" ? "transform rotate-180" : ""
                    }`}
                    />
                </button>
             </div>
          </div>

          {/* Loading / Error / Empty / Projects */}
          {isLoading ? ( // Changed loading check logic
            <div className="flex flex-col items-center justify-center py-20">
              <div className="w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-6"></div>
              <p className="text-gray-600 text-lg">Loading your projects...</p>
            </div>
          ) : uiError ? (
            <div className="bg-gradient-to-br from-red-50 to-pink-50 border border-red-100 rounded-xl p-8 text-center max-w-2xl mx-auto shadow-sm">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="h-8 w-8 text-red-500" />
              </div>
              <h3 className="text-xl font-medium text-red-800 mb-3">
                Error loading projects
              </h3>
              <p className="text-red-600 mb-6">{uiError}</p>
              <button
                onClick={refreshProjects}
                className="px-6 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 shadow-sm flex items-center mx-auto"
              >
                {/* Replaced SVG loader with Lucide icon */}
                <Loader className="animate-spin -ml-1 mr-3 h-4 w-4 text-white"/>
                Try Again
              </button>
            </div>
          ) : sortedProjects.length === 0 ? (
            <EmptyState onCreateNew={() => setNewProjectModalOpen(true)} />
          ) : viewMode === "grid" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {sortedProjects.map((project) => (
                 // Use the modified click handler here
                <ProjectCard
                  key={project.id}
                  project={project}
                  onClick={() => handleProjectClick(project.id, project.title)}
                />
              ))}
            </div>
          ) : (
            // List View Table
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
              <table className="min-w-full divide-y divide-gray-200">
                {/* Table Head */}
                <thead className="bg-gradient-to-r from-gray-50 to-gray-100">
                  <tr>
                    <th scope="col" className="px-6 py-3.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Project Name</th>
                    <th scope="col" className="px-6 py-3.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">Last Modified</th>
                    <th scope="col" className="px-6 py-3.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden lg:table-cell">Status</th>
                    <th scope="col" className="relative px-6 py-3.5"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                 {/* Table Body */}
                <tbody className="bg-white divide-y divide-gray-200">
                  {sortedProjects.map((project, index) => (
                    <tr
                      key={project.id}
                      className={`hover:bg-blue-50 cursor-pointer transition-colors ${ index % 2 === 0 ? "bg-white" : "bg-gray-50/50" }`}
                      // Use the modified click handler here
                      onClick={() => handleProjectClick(project.id, project.title)}
                    >
                       {/* Project Name Cell */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="bg-blue-100 rounded-md p-2 mr-3 hidden sm:flex flex-shrink-0"> {/* Added flex-shrink-0 */}
                            <FileText className="h-4 w-4 text-blue-600" />
                          </div>
                          <div className="min-w-0"> {/* Added min-w-0 for truncation */}
                            <div className="font-medium text-gray-900 truncate" title={project.title}>
                              {project.title}
                            </div>
                            <div className="text-xs text-gray-500 md:hidden">
                               {formatDate(project.lastModified)} {/* Use helper */}
                            </div>
                          </div>
                        </div>
                      </td>
                      {/* Last Modified Cell */}
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 hidden md:table-cell">
                           {formatDate(project.lastModified)} {/* Use helper */}
                      </td>
                      {/* Status Cell */}
                      <td className="px-6 py-4 whitespace-nowrap text-sm hidden lg:table-cell">
                        {project.collaborators?.length > 0 ? ( <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs">Shared</span>
                        ) : project.archived ? ( <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded-full text-xs">Archived</span>
                        ) : ( <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs">Active</span> )}
                      </td>
                       {/* Actions Cell */}
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex items-center justify-end space-x-1"> {/* Reduced space */}
                          <button onClick={(e) => { e.stopPropagation(); /* Handle edit */ }} className="text-gray-400 hover:text-blue-600 p-1 hover:bg-blue-50 rounded-full transition-all"> <Edit className="h-4 w-4" /> </button>
                          <button onClick={(e) => { e.stopPropagation(); /* Handle download */ }} className="text-gray-400 hover:text-blue-600 p-1 hover:bg-blue-50 rounded-full transition-all"> <Download className="h-4 w-4" /> </button>
                          <button onClick={(e) => { e.stopPropagation(); /* Handle more options */ }} className="text-gray-400 hover:text-blue-600 p-1 hover:bg-blue-50 rounded-full transition-all"> <MoreHorizontal className="h-4 w-4" /> </button>
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

      {/* Mobile sidebar backdrop */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/20 backdrop-blur-sm z-30 lg:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}
      {mobileSidebarOpen && ( <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-30 lg:hidden" onClick={() => setMobileSidebarOpen(false)} /> )}
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