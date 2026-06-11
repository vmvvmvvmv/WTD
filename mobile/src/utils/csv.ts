import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

export async function shareCsv(filename: string, csvText: string) {
  const fileUri = `${FileSystem.cacheDirectory}${filename}`;

  await FileSystem.writeAsStringAsync(fileUri, csvText, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(fileUri, {
      mimeType: 'text/csv',
      dialogTitle: 'CSV 공유',
    });
  }

  return fileUri;
}
