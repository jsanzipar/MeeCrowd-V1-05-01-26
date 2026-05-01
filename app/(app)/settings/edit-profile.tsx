import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '@/components/ui/Avatar';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useAuthStore } from '@/stores/authStore';
import { usersService } from '@/services/users';
import { storageService } from '@/services/storage';
import { toast } from '@/lib/toast';
import { haptics } from '@/lib/haptics';
import { colors, spacing, typography } from '@/theme';

export default function EditProfileScreen() {
  const router = useRouter();
  const { profile, session, loadProfile } = useAuthStore();

  const [displayName, setDisplayName] = useState(profile?.display_name ?? '');
  const [username, setUsername] = useState(profile?.username ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [website, setWebsite] = useState(profile?.website ?? '');
  const [avatarUri, setAvatarUri] = useState(profile?.avatar_url ?? null);
  const [newImageUri, setNewImageUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  const userId = session?.user?.id;

  const pickImage = async () => {
    if (Platform.OS !== 'web') {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        toast.error({
          title: 'Permission needed',
          message: 'Allow photo library access to change your avatar.',
        });
        return;
      }
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setNewImageUri(result.assets[0].uri);
      setAvatarUri(result.assets[0].uri);
    }
  };

  const handleSave = async () => {
    if (!userId) return;
    if (!displayName.trim()) {
      haptics.warning();
      toast.error({ title: 'Display name is required' });
      return;
    }
    if (!username.trim()) {
      haptics.warning();
      toast.error({ title: 'Username is required' });
      return;
    }

    haptics.medium();
    setSaving(true);
    try {
      let finalAvatarUrl = profile?.avatar_url ?? null;

      // Upload new avatar if one was picked
      if (newImageUri) {
        setUploadingImage(true);
        finalAvatarUrl = await storageService.uploadAvatar(userId, newImageUri);
        setUploadingImage(false);
      }

      await usersService.updateProfile(userId, {
        display_name: displayName.trim(),
        username: username.trim().toLowerCase(),
        bio: bio.trim() || null,
        website: website.trim() || null,
        avatar_url: finalAvatarUrl,
      });

      await loadProfile();
      haptics.success();
      toast.success({ title: 'Profile updated' });
      router.back();
    } catch (e: any) {
      // Log for debugging; show user-friendly toast
      console.error('Edit profile save error:', e);
      haptics.error();
      toast.fromError(e, 'Failed to save profile');
    } finally {
      setSaving(false);
      setUploadingImage(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Avatar section */}
        <View style={styles.avatarSection}>
          <TouchableOpacity
            onPress={pickImage}
            disabled={saving}
            accessibilityRole="button"
            accessibilityLabel="Change profile photo"
          >
            <View>
              <Avatar
                uri={avatarUri}
                name={displayName}
                size={96}
              />
              <View style={styles.cameraButton}>
                <Ionicons name="camera" size={16} color={colors.white} />
              </View>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={pickImage}
            disabled={saving}
            accessibilityRole="button"
            accessibilityLabel="Change photo"
          >
            <Text style={styles.changePhotoText}>Change Photo</Text>
          </TouchableOpacity>
          {uploadingImage && (
            <ActivityIndicator color={colors.primary} style={styles.uploadIndicator} />
          )}
        </View>

        {/* Form fields */}
        <Input
          label="Display Name"
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="Your display name"
          icon="person-outline"
          editable={!saving}
        />

        <Input
          label="Username"
          value={username}
          onChangeText={(t) => setUsername(t.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
          placeholder="username"
          icon="at-outline"
          autoCapitalize="none"
          editable={!saving}
        />

        <Input
          label="Bio"
          value={bio}
          onChangeText={setBio}
          placeholder="Tell us about yourself"
          icon="document-text-outline"
          multiline
          numberOfLines={3}
          style={styles.bioInput}
          editable={!saving}
        />

        <Input
          label="Website"
          value={website}
          onChangeText={setWebsite}
          placeholder="https://yoursite.com"
          icon="globe-outline"
          autoCapitalize="none"
          keyboardType="url"
          editable={!saving}
        />

        <Button
          title={saving ? 'Saving...' : 'Save Changes'}
          onPress={handleSave}
          loading={saving}
          size="lg"
          style={styles.saveButton}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing['5xl'],
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: spacing['2xl'],
  },
  cameraButton: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.background,
  },
  changePhotoText: {
    ...typography.bodyBold,
    color: colors.primary,
    marginTop: spacing.sm,
  },
  uploadIndicator: {
    marginTop: spacing.sm,
  },
  bioInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  saveButton: {
    marginTop: spacing.lg,
  },
});
