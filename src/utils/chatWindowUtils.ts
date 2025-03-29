import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '@/lib/firebase';

export async function uploadImageAndGetPublicUrl(file: File): Promise<string> {
  const fileRef = ref(storage, `public-uploads/${Date.now()}_${file.name}`);
  await uploadBytes(fileRef, file);
  const publicUrl = await getDownloadURL(fileRef);
  return publicUrl;
}
