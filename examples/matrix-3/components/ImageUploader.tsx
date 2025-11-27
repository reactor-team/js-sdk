"use client";

import { useState } from "react";
import { useReactor } from "@reactor-team/js-sdk";

interface ImageUploaderProps {
  className?: string;
}

// Example starting images for Matrix-2
const EXAMPLE_IMAGES = [
  {
    id: "water-temple",
    title: "Templte",
    url: "/examples/water-temple.png",
  },
  {
    id: "water-game",
    title: "Water Park",
    url: "/examples/water-game.png",
  },
  {
    id: "beach",
    title: "Beach Scene",
    url: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=400&h=300&fit=crop",
  },
  {
    id: "Snow",
    title: "Snowy Village",
    url: "/examples/snow.png",
  },
];

/**
 * ImageUploader
 *
 * A component for uploading and setting a starting image for the Matrix-2 model:
 * - Allows users to select an image file from their device
 * - Converts the image to base64 format for transmission
 * - Displays a preview of the uploaded image in a fixed-size container
 * - Sends "set_starting_image" message to use the image as the first frame
 */
export function ImageUploader({ className = "" }: ImageUploaderProps) {
  const { sendMessage, status } = useReactor((state) => ({
    sendMessage: state.sendMessage,
    status: state.status,
  }));

  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [selectedExampleId, setSelectedExampleId] = useState<string | null>(null);

  // Handle image file upload and convert to base64
  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      setUploadedImage(base64String);
      setSelectedExampleId(null);
    };
    reader.readAsDataURL(file);
  };

  // Handle selecting an example image
  const handleExampleSelect = async (imageUrl: string, imageId: string) => {
    try {
      // Fetch the image and convert to base64
      const response = await fetch(imageUrl);
      const blob = await response.blob();

      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        setUploadedImage(base64String);
        setSelectedExampleId(imageId);
      };
      reader.readAsDataURL(blob);
    } catch (error) {
      console.error("Failed to load example image:", error);
    }
  };

  // Send the uploaded image to the model as the starting frame
  const handleSetStartingImage = async () => {
    if (!uploadedImage) return;

    // Extract base64 data (remove the data:image/...;base64, prefix)
    const base64Data = uploadedImage.split(",")[1];
    const imageId = `upload_${Date.now()}`;

    try {
      await sendMessage({
        type: "set_starting_image",
        data: {
          base64_image: base64Data,
          image_id: imageId,
        },
      });
      console.log("Starting image set successfully");
    } catch (error) {
      console.error("Failed to set starting image:", error);
    }
  };

  return (
    <div
      className={`bg-gray-900/40 rounded-lg p-3 border border-gray-700/30 flex flex-col ${className} ${
        status !== "ready" ? "opacity-50 pointer-events-none" : ""
      }`}
    >
      <div className="flex justify-between items-center mb-2">
        <span className="text-xs font-medium text-gray-400">
          Starting Image
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <label className="px-4 py-2 sm:py-1.5 rounded-md bg-gray-500/10 text-gray-300 border border-gray-500/20 hover:bg-gray-500/20 active:scale-95 transition-all duration-200 text-xs font-medium cursor-pointer text-center flex-shrink-0 touch-none">
          Upload Image
          <input
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            className="hidden"
          />
        </label>

        {/* Example Images */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-400">
              Or choose an example
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {EXAMPLE_IMAGES.map((example) => (
              <button
                key={example.id}
                onClick={() => handleExampleSelect(example.url, example.id)}
                className={`group relative overflow-hidden rounded-md border transition-all duration-200 ${
                  selectedExampleId === example.id
                    ? "border-blue-500/50 ring-1 ring-blue-500/30"
                    : "border-gray-700/50 hover:border-gray-600/50"
                }`}
              >
                <div className="h-16 overflow-hidden bg-gray-800/30">
                  <img
                    src={example.url}
                    alt={example.title}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-1">
                  <p className="text-[10px] text-white font-medium">
                    {example.title}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {uploadedImage && (
          <>
            <div className="h-16 sm:h-18 overflow-hidden rounded-md border border-gray-700/50 bg-gray-800/30">
              <img
                src={uploadedImage}
                alt="Uploaded preview"
                className="w-full h-full object-contain"
              />
            </div>
            <button
              onClick={handleSetStartingImage}
              className="px-4 py-2 sm:py-1.5 rounded-md bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20 active:scale-95 transition-all duration-200 text-xs font-medium flex-shrink-0 touch-none"
              style={{ touchAction: "manipulation" }}
            >
              Set as Starting Frame
            </button>
          </>
        )}
      </div>
    </div>
  );
}
