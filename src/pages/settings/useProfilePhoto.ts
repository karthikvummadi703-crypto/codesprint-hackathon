import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { fileToAvatarDataUrl } from '../../services/imageService';

interface ProfilePhotoOptions {
  setError: (message: string) => void;
  flashSaved: () => void;
}

export function useProfilePhoto({ setError, flashSaved }: ProfilePhotoOptions) {
  const { updateAvatar } = useAuth();
  const [photoBusy, setPhotoBusy] = useState(false);

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Clear the input so re-selecting the same file still fires a change event.
    e.target.value = '';
    if (!file) return;
    setPhotoBusy(true);
    setError('');
    try {
      const dataUrl = await fileToAvatarDataUrl(file);
      await updateAvatar(dataUrl);
      flashSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPhotoBusy(false);
    }
  };

  const handleRemovePhoto = async () => {
    setPhotoBusy(true);
    setError('');
    try {
      await updateAvatar(null);
      flashSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPhotoBusy(false);
    }
  };

  return { photoBusy, handlePhotoChange, handleRemovePhoto };
}

export type ProfilePhotoController = ReturnType<typeof useProfilePhoto>;
