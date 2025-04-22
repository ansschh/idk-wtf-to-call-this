"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Download, AlertCircle, ZoomIn, ZoomOut, RotateCw, Loader, X } from 'lucide-react';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface ImagePreviewProps {
  filename: string;
  fileId: string;
  projectId: string;
}

const ImagePreview: React.FC<ImagePreviewProps> = ({
  filename,
  fileId,
  projectId
}) => {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [zoom, setZoom] = useState(100);
  const [rotation, setRotation] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchImageData = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const possibleCollections = ["projectFiles", "project_files"];
        let fileData: any = null;
        let found = false;

        for (const coll of possibleCollections) {
          try {
            const docSnap = await getDoc(doc(db, coll, fileId));
            if (docSnap.exists()) {
              fileData = docSnap.data();
              found = true;
              break;
            }
          } catch { /* continue */ }
        }

        if (!found) {
          for (const coll of possibleCollections) {
            const q = query(
              collection(db, coll),
              where("projectId", "==", projectId),
              where("_name_", "==", filename)
            );
            const snap = await getDocs(q);
            if (!snap.empty) {
              fileData = snap.docs[0].data();
              found = true;
              break;
            }
          }
        }

        if (!found || !fileData) {
          setError("File not found. Please check the project.");
          return;
        }

        if (fileData.dataUrl) {
          setImageUrl(fileData.dataUrl);
        } else if (fileData.downloadURL) {
          setImageUrl(fileData.downloadURL);
        } else if (typeof fileData.content === 'string') {
          if (fileData.content.startsWith('data:image')) {
            setImageUrl(fileData.content);
          } else if (/^[A-Za-z0-9+/=]+$/.test(fileData.content)) {
            let mime = 'image/jpeg';
            const ext = filename.toLowerCase().split('.').pop();
            if (ext === 'png') mime = 'image/png';
            else if (ext === 'gif') mime = 'image/gif';
            else if (ext === 'webp') mime = 'image/webp';
            else if (ext === 'svg') mime = 'image/svg+xml';
            setImageUrl(`data:${mime};base64,${fileData.content}`);
          }
        }

        if (!imageUrl && !error) {
          const field = Object.entries(fileData).find(([_, v]) =>
            typeof v === 'string' && ((v as string).startsWith('data:image') || (/^https?:.*\.(jpg|jpeg|png|gif|svg|webp)$/i.test(v)))
          );
          if (field) setImageUrl(field[1] as string);
          else setError("No image data found. The file may not be a valid image.");
        }
      } catch (e: any) {
        setError(`Failed to fetch image: ${e.message || e}`);
      } finally {
        setIsLoading(false);
      }
    };
    if (fileId) fetchImageData();
  }, [fileId, filename, projectId]);

  const handleZoomIn = () => setZoom(z => Math.min(z + 25, 300));
  const handleZoomOut = () => setZoom(z => Math.max(z - 25, 50));
  const handleRotate = () => setRotation(r => (r + 90) % 360);
  const handleDownload = () => {
    if (!imageUrl) return;
    const a = document.createElement('a');
    a.href = imageUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="h-full flex flex-col bg-white" ref={containerRef}>
      <div className="bg-white p-2 flex justify-between items-center border-b border-gray-200 shadow-sm flex-shrink-0">
        <div
          className="text-gray-800 font-medium text-sm truncate"
          title={filename}
        >
          {filename}
        </div>
        <div className="flex items-center space-x-1">
          <button
            onClick={handleZoomOut}
            disabled={!imageUrl || zoom <= 50}
            className={`p-1.5 rounded ${
              !imageUrl || zoom <= 50
                ? 'text-gray-400 cursor-not-allowed'
                : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
            }`}
            title="Zoom out"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <span className="text-xs text-gray-600 font-medium mx-1 w-10 text-center">
            {zoom}%
          </span>
          <button
            onClick={handleZoomIn}
            disabled={!imageUrl || zoom >= 300}
            className={`p-1.5 rounded ${
              !imageUrl || zoom >= 300
                ? 'text-gray-400 cursor-not-allowed'
                : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
            }`}
            title="Zoom in"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <button
            onClick={handleRotate}
            disabled={!imageUrl}
            className={`p-1.5 rounded ${
              !imageUrl
                ? 'text-gray-400 cursor-not-allowed'
                : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
            }`}
            title="Rotate"
          >
            <RotateCw className="h-4 w-4" />
          </button>
          <div className="w-px h-4 bg-gray-300 mx-2" />
          <button
            onClick={handleDownload}
            disabled={!imageUrl}
            className={`flex items-center px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 shadow-sm border focus:outline-none focus:ring-2 focus:ring-offset-1 ${
              !imageUrl
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed border-gray-200'
                : 'bg-white text-gray-600 hover:bg-gray-50 border-gray-300 hover:border-gray-400 focus:ring-indigo-500'
            }`}
            title="Download image"
          >
            <Download className="h-4 w-4 mr-1.5" />
            <span className="hidden sm:inline">Download</span>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-gray-100 flex items-center justify-center p-4">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center">
            <Loader className="h-8 w-8 text-blue-500 animate-spin mb-3" />
            <p className="text-gray-600">Loading image...</p>
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md text-center shadow-sm">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="h-6 w-6 text-red-500" />
            </div>
            <h3 className="text-lg font-medium text-red-700 mb-2">
              Error Loading Image
            </h3>
            <p className="text-red-600 text-sm mb-4">{error}</p>
            <p className="text-gray-500 text-xs">
              Check if the file exists and is a supported image format.
            </p>
          </div>
        ) : imageUrl ? (
          <div className="relative inline-flex items-center justify-center max-w-full max-h-full p-2 bg-white shadow rounded">
            <img
              src={imageUrl}
              alt={filename}
              className="object-contain max-w-full max-h-full block"
              style={{
                transform: `scale(${zoom / 100}) rotate(${rotation}deg)`,
                transition: 'transform 0.2s ease-out'
              }}
              onError={e => {
                console.error("Image failed to load:", e);
                setError("Failed to display image: Invalid format or URL");
              }}
            />
          </div>
        ) : (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 max-w-md text-center shadow-sm">
            <div className="w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="h-6 w-6 text-yellow-500" />
            </div>
            <h3 className="text-lg font-medium text-yellow-700 mb-2">
              No Image Data
            </h3>
            <p className="text-yellow-600 text-sm">
              The file exists but doesn't contain displayable image data.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ImagePreview;
