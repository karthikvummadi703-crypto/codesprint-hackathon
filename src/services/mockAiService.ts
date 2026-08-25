import { ChatSession, KnowledgeFile } from '../types';

export const MOCK_CHAT_SESSIONS: ChatSession[] = [
  {
    id: '1',
    title: 'Why is AQI high today?',
    messages: [
      {
        id: 'm1',
        role: 'user',
        content: 'Why is AQI high today?',
        timestamp: new Date(Date.now() - 3600000),
      },
      {
        id: 'm2',
        role: 'assistant',
        content:
          'The AQI in Gudur is currently 142 (Unhealthy for Sensitive Groups), primarily driven by elevated PM2.5 levels at 78 µg/m³. This is likely due to a combination of vehicle emissions during morning rush hours and reduced wind speed today, which limits pollutant dispersion. I recommend limiting outdoor activities, especially for children and elderly individuals.',
        timestamp: new Date(Date.now() - 3540000),
      },
    ],
    updatedAt: new Date(Date.now() - 3540000),
    createdAt: new Date(Date.now() - 3600000),
  },
  {
    id: '2',
    title: 'Compare my pollution history',
    messages: [],
    updatedAt: new Date(Date.now() - 86400000),
    createdAt: new Date(Date.now() - 86400000),
  },
  {
    id: '3',
    title: 'How can I reduce exposure?',
    messages: [],
    updatedAt: new Date(Date.now() - 172800000),
    createdAt: new Date(Date.now() - 172800000),
  },
  {
    id: '4',
    title: 'Analyze my uploaded report',
    messages: [],
    updatedAt: new Date(Date.now() - 259200000),
    createdAt: new Date(Date.now() - 259200000),
  },
  {
    id: '5',
    title: 'How can I reduce my carbon footprint?',
    messages: [],
    updatedAt: new Date(Date.now() - 345600000),
    createdAt: new Date(Date.now() - 345600000),
  },
];

export const MOCK_KNOWLEDGE_FILES: KnowledgeFile[] = [
  {
    id: 'f1',
    name: 'andhra_air_quality_report_2024.pdf',
    type: 'pdf',
    size: 2400000,
    uploadedAt: new Date(Date.now() - 86400000),
    status: 'ready',
  },
  {
    id: 'f2',
    name: 'pollution_data_jan_june.csv',
    type: 'csv',
    size: 148000,
    uploadedAt: new Date(Date.now() - 172800000),
    status: 'ready',
  },
];

export const SUGGESTED_PROMPTS = [
  'Summarize my environmental data',
  'Why is my AQI increasing?',
  'Analyze my uploaded report',
  'Compare my pollution history',
  'How can I reduce my carbon footprint?',
  'What are the health effects of PM2.5?',
];

export const MOCK_AI_RESPONSES: Record<string, string> = {
  default:
    "I've analyzed your local air quality data for Gudur, Andhra Pradesh. The current AQI is 142, which falls in the **Unhealthy for Sensitive Groups** category. PM2.5 is the dominant pollutant at 78 µg/m³ — more than double the safe limit. I recommend staying indoors during peak hours (8 AM–6 PM) and using air purifiers if available.",
  'Summarize my environmental data':
    "📊 **Environmental Summary for Gudur, AP**\n\n- **AQI**: 142 (Unhealthy for Sensitive Groups)\n- **Dominant Pollutant**: PM2.5 (78 µg/m³)\n- **Trend**: Worsening — up 8 points over 24 hours\n- **Best time outdoors**: Early morning (4–6 AM)\n- **Carbon footprint this month**: 12.4 kg CO₂e saved vs. average\n\nYour air quality has been consistently poor this week. Consider reducing outdoor exercise and using an N95 mask when going out.",
  'Why is my AQI increasing?':
    "🔍 **AQI Increase Analysis**\n\nYour AQI rose from 134 (yesterday) to 142 (today). Key contributing factors:\n\n1. **Wind patterns**: Low wind speed is trapping pollutants near ground level\n2. **Vehicle traffic**: Morning commute hours added ~15% more NO₂\n3. **PM2.5 spike**: Likely construction activity in the area\n\nBased on my prediction model, AQI is expected to peak at **168** around 6 PM before improving tomorrow morning.",
};

export async function getMockAIResponse(message: string): Promise<string> {
  await new Promise((r) => setTimeout(r, 1200 + Math.random() * 800));
  const key = Object.keys(MOCK_AI_RESPONSES).find((k) =>
    message.toLowerCase().includes(k.toLowerCase())
  );
  return MOCK_AI_RESPONSES[key ?? 'default'];
}
