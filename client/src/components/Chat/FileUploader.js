import React, { useState } from 'react';
import axios from 'axios';
import { showToast, showSystemNotification } from '../../services/notifications';
import { uploadFile as backendUpload } from '../../services/upload';

/**
 * FileUploader - Component upload file with S3 presigned URL
 * Flow: Select file → Get presigned URL → Upload to S3 → Return file URL
 */
const FileUploader = ({ onFileUploaded, disabled }) => {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (disabled) {
      const msg = 'Vui lòng chọn người nhận trước khi gửi file';
      showToast('Upload file', msg);
      showSystemNotification('Upload file', msg);
      return;
    }

    // Validate file size (max 50MB)
    const MAX_SIZE = 50 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      const msg = `File quá lớn! Kích thước tối đa là 50MB`;
      showToast('Upload file', msg);
      showSystemNotification('Upload file', msg);
      return;
    }

    setUploading(true);
    setUploadProgress(0);

    try {
      // Step 1: Try presigned URL from backend
      const token = localStorage.getItem('token') || sessionStorage.getItem('token');
      let presigned = null;
      try {
        const resp = await axios.post(
          '/uploads/presigned-url',
          {
            filename: file.name,
            content_type: file.type || 'application/octet-stream',
            file_size: file.size,
          },
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
            timeout: 10000,
          }
        );
        presigned = resp.data;
      } catch (presignErr) {
        // Presign failed; we'll fallback to backend upload below.
        console.warn('Presigned URL request failed, will use backend upload', presignErr?.response?.data || presignErr.message);
      }

      if (presigned && presigned.upload_url && presigned.fields) {
        // Use presigned POST to upload directly to S3
        const { upload_url, fields, file_url, key } = presigned;
        const formData = new FormData();
        Object.keys(fields).forEach((fieldKey) => {
          formData.append(fieldKey, fields[fieldKey]);
        });
        formData.append('file', file);

        await axios.post(upload_url, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          onUploadProgress: (progressEvent) => {
            const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            setUploadProgress(progress);
          },
          timeout: 0, // let large uploads take time
        });

        if (onFileUploaded) {
          onFileUploaded({
            url: file_url,
            name: file.name,
            size: file.size,
            type: file.type || 'application/octet-stream',
            key: key,
          });
        }
      } else {
        // Fallback: upload to backend directly (no need to change backend process)
        const token2 = localStorage.getItem('token') || sessionStorage.getItem('token');
        const result = await backendUpload(file, token2);

        // backendUpload returns { file_url, file_name, file_size, file_type }
        if (onFileUploaded) {
          onFileUploaded({
            url: result.file_url,
            name: result.file_name || file.name,
            size: result.file_size || file.size,
            type: result.file_type || file.type || 'application/octet-stream',
          });
        }
      }

      setUploadProgress(100);
      setTimeout(() => {
        setUploading(false);
        setUploadProgress(0);
      }, 500);

      // Reset input
      e.target.value = '';
    } catch (error) {
      console.error('Error uploading file:', error);
      // If server responded with a debug_id, surface it to the user
      let debugId = null;
      if (error?.response?.data) {
        debugId = error.response.data.debug_id || error.response.data.debugId || null;
      }

      const msg = debugId ? `Lỗi khi upload file (debug id: ${debugId}). Vui lòng liên hệ admin.` : 'Lỗi khi upload file. Vui lòng thử lại!';
      showToast('Upload file thất bại', msg);
      showSystemNotification('Upload file thất bại', msg);
      setUploading(false);
      setUploadProgress(0);
      e.target.value = '';
    }
  };

  return (
    <div className="file-uploader">
      <label 
        htmlFor="file-input" 
        className={`btn-upload ${disabled || uploading ? 'disabled' : ''}`}
        style={{ opacity: disabled || uploading ? 0.5 : 1, cursor: disabled || uploading ? 'not-allowed' : 'pointer' }}
      >
        {uploading ? `📤 ${uploadProgress}%` : '📎 Chia sẻ tệp'}
      </label>
      <input
        type="file"
        id="file-input"
        onChange={handleFileUpload}
        disabled={disabled || uploading}
        style={{ display: 'none' }}
      />
    </div>
  );
};

export default FileUploader;
