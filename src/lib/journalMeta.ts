export const MOOD_OPTIONS = [
  { value: "peaceful", label: "平静" },
  { value: "joyful", label: "开心" },
  { value: "tender", label: "柔软" },
  { value: "thoughtful", label: "思索" },
  { value: "tired", label: "疲惫" },
  { value: "stormy", label: "起伏" },
] as const;

export const WEATHER_OPTIONS = [
  { value: "sunny", label: "晴" },
  { value: "cloudy", label: "多云" },
  { value: "rainy", label: "雨" },
  { value: "windy", label: "风" },
  { value: "foggy", label: "雾" },
  { value: "snowy", label: "雪" },
] as const;

export function getMoodLabel(value: string): string {
  return MOOD_OPTIONS.find((option) => option.value === value)?.label ?? "未记录";
}

export function getWeatherLabel(value: string): string {
  return WEATHER_OPTIONS.find((option) => option.value === value)?.label ?? "未记录";
}
