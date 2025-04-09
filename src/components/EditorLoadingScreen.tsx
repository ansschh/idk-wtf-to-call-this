// components/EditorLoadingScreen.tsx
import React from 'react';
import { Loader } from 'lucide-react';

interface EditorLoadingScreenProps {
  projectName: string | null;
  status: string;
}

const EditorLoadingScreen: React.FC<EditorLoadingScreenProps> = ({ projectName, status }) => {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white transition-opacity duration-300 ease-in-out">
      <div className="text-center p-8 rounded-lg">
        {/* Enhanced Loader */}
        <div className="relative mb-8 w-16 h-16 mx-auto">
          <div className="absolute inset-0 border-4 border-t-transparent border-blue-500 rounded-full animate-spin"></div>
          <div className="absolute inset-2 border-4 border-b-transparent border-teal-400 rounded-full animate-spin animation-delay-200"></div>
          <div className="absolute inset-4 flex items-center justify-center text-blue-300">
             <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
             </svg>
          </div>
        </div>

        {projectName && (
          <h1 className="text-2xl font-semibold mb-4">
            Loading <span className="text-blue-400 font-bold">{projectName}</span>...
          </h1>
        )}
        {!projectName && (
           <h1 className="text-2xl font-semibold mb-4">Loading Editor...</h1>
        )}

        {/* Status Text */}
        <p className="text-sm text-gray-400 mt-2 transition-all duration-500 min-h-[20px]">
          {status}
        </p>

        {/* Optional Subtle Animation */}
        <div className="mt-10 w-32 h-1 bg-gray-700 rounded-full overflow-hidden mx-auto">
           <div className="h-full bg-gradient-to-r from-blue-500 via-teal-400 to-blue-500 animate-loading-bar"></div>
        </div>

        {/* Add Keyframes for the bar */}
        <style jsx global>{`
          @keyframes loading-bar {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(100%); }
          }
          .animate-loading-bar {
            animation: loading-bar 1.5s linear infinite;
          }
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
          .animate-spin {
            animation: spin 1s linear infinite;
          }
          .animation-delay-200 {
            animation-delay: -0.2s; /* Offset the inner spinner */
            animation-direction: reverse; /* Spin the other way */
          }
        `}</style>
      </div>
    </div>
  );
};

export default EditorLoadingScreen;