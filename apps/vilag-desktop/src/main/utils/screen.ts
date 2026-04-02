/**
 * Birincil ekranın boyutlarını hem mantıksal (logical) hem de fiziksel (physical)
 * pikseller cinsinden hesaplayan yardımcı fonksiyon.
 */
import { screen } from 'electron';

export const getScreenSize = () => {
  const primaryDisplay = screen.getPrimaryDisplay();

  const logicalSize = primaryDisplay.size; // Mantıksal boyut = Fiziksel / ölçekleme (scaleX)

  const scaleFactor = primaryDisplay.scaleFactor;

  const physicalSize = {
    width: Math.round(logicalSize.width * scaleFactor),
    height: Math.round(logicalSize.height * scaleFactor),
  };

  return {
    id: primaryDisplay.id,
    physicalSize,
    logicalSize,
    scaleFactor,
  };
};