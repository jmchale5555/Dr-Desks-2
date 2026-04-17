import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, MapPin, X, Upload, Image as ImageIcon } from 'lucide-react';
import { useRooms } from '../../../hooks/useRooms';
import { useHorizontalDragScroll } from '../../../hooks/useHorizontalDragScroll';
import { roomService } from '../../../services/roomService';

const sanitizeFile = (file) => {
  /**
   * Create a new File object with sanitized filename
   */
  // Get extension
  const ext = file.name.split('.').pop().toLowerCase();
  
  // Create clean name: remove special chars, replace spaces with underscores
  let cleanName = file.name
    .replace(/\.[^/.]+$/, '') // Remove extension
    .replace(/[^\w\s-]/g, '') // Remove special characters
    .replace(/\s+/g, '_')     // Replace spaces with underscores
    .substring(0, 50);        // Limit length
  
  // If name is empty after sanitization, use timestamp
  if (!cleanName) {
    cleanName = `image_${Date.now()}`;
  }
  
  const sanitizedFilename = `${cleanName}.${ext}`;
  
  // Create new File object with sanitized name
  return new File([file], sanitizedFilename, { type: file.type });
};

export default function RoomManagement() {
  const { rooms, loading, error, loadRooms, createRoom, updateRoom, deleteRoom } = useRooms(true);
  const { containerRef, isDragging, dragHandlers } = useHorizontalDragScroll();
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    numberOfDesks: '',
  });
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [formErrors, setFormErrors] = useState({});

  const openModal = (room = null) => {
    if (room) {
      setEditingRoom(room);
      setFormData({
        name: room.name,
        numberOfDesks: room.number_of_desks.toString(),
      });
      setImagePreview(room.image_url);
    } else {
      setEditingRoom(null);
      setFormData({ name: '', numberOfDesks: '' });
      setImagePreview(null);
    }
    setImageFile(null);
    setFormErrors({});
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingRoom(null);
    setFormData({ name: '', numberOfDesks: '' });
    setImageFile(null);
    setImagePreview(null);
    setFormErrors({});
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Client-side validation
    const errors = {};
    
    // Check file type
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      errors.image = 'Only JPG, PNG, and WebP images are allowed';
    }
    
    // Check file size (2MB)
    if (file.size > 2 * 1024 * 1024) {
      errors.image = 'Image must be less than 2MB';
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    // Sanitize the filename before storing
    const sanitizedFile = sanitizeFile(file);
    setImageFile(sanitizedFile);
    setFormErrors({});
    
    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result);
    };
    reader.readAsDataURL(file); // Use original file for preview
  };

  const handleRemoveImage = async (roomId) => {
    try {
      await roomService.removeImage(roomId);
      loadRooms(); // Refresh list
      if (editingRoom?.id === roomId) {
        setImagePreview(null);
      }
    } catch (err) {
      console.error('Failed to remove image:', err);
    }
  };

  const handleDelete = async (roomId) => {
    try {
      await deleteRoom(roomId);
      setDeleteConfirm(null); // ← Close modal after successful deletion
    } catch (err) {
      // Error is already handled by the hook, but we keep modal open
      console.error('Failed to delete room:', err);
    }
  };

  const validateForm = () => {
    const errors = {};

    if (!formData.name.trim()) {
      errors.name = 'Room name is required';
    } else if (formData.name.trim().length < 3) {
      errors.name = 'Room name must be at least 3 characters';
    }

    if (!formData.numberOfDesks) {
      errors.numberOfDesks = 'Number of desks is required';
    } else {
      const num = parseInt(formData.numberOfDesks);
      if (isNaN(num) || num < 1) {
        errors.numberOfDesks = 'Must be at least 1 desk';
      } else if (num > 100) {
        errors.numberOfDesks = 'Cannot exceed 100 desks';
      }
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    try {
      // Create FormData for file upload
      const formDataToSend = new FormData();
      formDataToSend.append('name', formData.name.trim());
      formDataToSend.append('number_of_desks', parseInt(formData.numberOfDesks));
      
      // Add image if selected
      if (imageFile) {
        formDataToSend.append('image', imageFile);
      }

      if (editingRoom) {
        await updateRoom(editingRoom.id, formDataToSend);
      } else {
        await createRoom(formDataToSend);
      }
      
      closeModal();
    } catch (err) {
      console.error('Failed to save room:', err);
      setFormErrors({ general: err.message || 'Failed to save room' });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-gray-900 dark:text-white">
          <MapPin className="h-6 w-6" />
          <h2 className="text-2xl font-bold">Room Management</h2>
        </div>
        <button
          onClick={() => openModal()}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          Add Room
        </button>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Rooms Table */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        {loading && rooms.length === 0 ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">
            Loading rooms...
          </div>
        ) : rooms.length === 0 ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">
            No rooms found. Click "Add Room" to create one.
          </div>
        ) : (
          <div
            ref={containerRef}
            className={`overflow-x-auto ${isDragging ? 'cursor-grabbing select-none' : 'cursor-grab'}`}
            {...dragHandlers}
          >
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Image
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Room Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Number of Desks
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {rooms.map((room, index) => (
                  <tr 
                    key={room.id}
                    className={`transition-colors ${
                      index % 2 === 0 
                        ? 'bg-white dark:bg-gray-800' 
                        : 'bg-gray-50 dark:bg-gray-700'
                    } hover:bg-gray-100 dark:hover:bg-gray-600`}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      {room.image_url ? (
                        <img 
                          src={room.image_url} 
                          alt={room.name}
                          className="h-12 w-12 object-cover rounded-lg"
                        />
                      ) : (
                        <div className="h-12 w-12 bg-gray-200 dark:bg-gray-700 rounded-lg flex items-center justify-center">
                          <ImageIcon className="h-6 w-6 text-gray-400" />
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900 dark:text-white">
                        {room.name}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        {room.number_of_desks} desks
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        {new Date(room.created_at).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={() => openModal(room)}
                        className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 mr-4 inline-flex items-center gap-1"
                      >
                        <Edit2 className="h-4 w-4" />
                        Edit
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(room)}
                        className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 inline-flex items-center gap-1"
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                {editingRoom ? 'Edit Room' : 'Create New Room'}
              </h3>
              <button
                onClick={closeModal}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {/* General Error */}
              {formErrors.general && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg text-sm">
                  {formErrors.general}
                </div>
              )}

              {/* Image Upload */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Room Image
                </label>
                
                {/* Image Preview */}
                {imagePreview && (
                  <div className="mb-3 relative">
                    <img 
                      src={imagePreview} 
                      alt="Preview"
                      className="w-full h-48 object-cover rounded-lg"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setImagePreview(null);
                        setImageFile(null);
                        if (editingRoom) {
                          handleRemoveImage(editingRoom.id);
                        }
                      }}
                      className="absolute top-2 right-2 p-2 bg-red-600 text-white rounded-full hover:bg-red-700"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}

                {/* Upload Button */}
                <label className="flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer hover:border-blue-500 dark:hover:border-blue-400 transition-colors">
                  <Upload className="h-5 w-5 text-gray-400" />
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    {imagePreview ? 'Change image' : 'Upload image'}
                  </span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleImageChange}
                    className="hidden"
                  />
                </label>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  JPG, PNG or WebP. Max 2MB.
                </p>
                {formErrors.image && (
                  <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                    {formErrors.image}
                  </p>
                )}
              </div>

              {/* Room Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Room Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className={`w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                    formErrors.name 
                      ? 'border-red-500' 
                      : 'border-gray-300 dark:border-gray-600'
                  }`}
                  placeholder="e.g. Ground Floor - Open Plan"
                />
                {formErrors.name && (
                  <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                    {formErrors.name}
                  </p>
                )}
              </div>

              {/* Number of Desks */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Number of Desks *
                </label>
                <input
                  type="number"
                  value={formData.numberOfDesks}
                  onChange={(e) => setFormData({ ...formData, numberOfDesks: e.target.value })}
                  className={`w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                    formErrors.numberOfDesks 
                      ? 'border-red-500' 
                      : 'border-gray-300 dark:border-gray-600'
                  }`}
                  placeholder="e.g. 20"
                  min="1"
                  max="100"
                />
                {formErrors.numberOfDesks && (
                  <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                    {formErrors.numberOfDesks}
                  </p>
                )}
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  {loading ? 'Saving...' : editingRoom ? 'Update Room' : 'Create Room'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
              Delete Room?
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Are you sure you want to delete "{deleteConfirm.name}"? This action cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm.id)}
                disabled={loading}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {loading ? 'Deleting...' : 'Delete Room'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
