import { ContentData, Grade, ContentModule } from '../types';
import { DEFAULT_GRADE_URLS } from '../config';

export const fetchContentFromSheet = async (gradeUrls?: Record<number, string>): Promise<ContentData> => {
  const result: ContentData = {
    grades: {
      1: emptyGradeData(1),
      2: emptyGradeData(2),
      3: emptyGradeData(3),
      4: emptyGradeData(4),
      5: emptyGradeData(5),
    }
  };

  // Merge default URLs with provided (localStorage) URLs
  // Provided ones take precedence if they are not empty strings
  const finalUrls = { ...DEFAULT_GRADE_URLS };
  if (gradeUrls) {
    Object.entries(gradeUrls).forEach(([g, url]) => {
      if (url && url.trim() !== "") {
        finalUrls[parseInt(g) as Grade] = url;
      }
    });
  }

  const fetchPromises = Object.entries(finalUrls).map(async ([gradeStr, url]) => {
    const grade = parseInt(gradeStr) as Grade;
    if (!url || typeof url !== 'string' || !url.startsWith('http')) return;

    try {
      const cleanUrl = url.trim();
      const fetchWithRetry = async (attempt: number = 1): Promise<Response> => {
        // Append random param to bypass cache
        const fetchUrl = cleanUrl + (cleanUrl.includes('?') ? '&' : '?') + 'cache_bust=' + Date.now() + '_' + attempt;
        
        try {
          const response = await fetch(fetchUrl, {
            method: 'GET',
            mode: 'cors', // Explicitly set cors
            credentials: 'omit',
            redirect: 'follow'
          });
          
          if (!response.ok && attempt < 2) {
            console.warn(`Retry fetch for Grade ${grade}, attempt ${attempt}`);
            return fetchWithRetry(attempt + 1);
          }
          return response;
        } catch (err) {
          if (attempt < 2) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            return fetchWithRetry(attempt + 1);
          }
          throw err;
        }
      };

      const rawResponse = await fetchWithRetry();
      if (!rawResponse.ok) throw new Error(`Network response: ${rawResponse.status}`);
      
      const text = await rawResponse.text();
      let responseData;
      try {
        responseData = JSON.parse(text);
      } catch (e) {
        console.error(`Invalid JSON from Grade ${grade}:`, text.substring(0, 100));
        return;
      }
      
      console.log(`📡 Tín hiệu từ Grade ${grade}:`, responseData);

      // Normalize data based on the Google Apps Script output structure
      if (responseData && typeof responseData === 'object') {
        const d = responseData;
        // Support both {worksheets: [], ...} and {grades: { 1: {worksheets: [], ...} }}
        const targetData = d.grades?.[grade] || d;

        const processModule = (m: any, type: any) => {
          const isRawHtml = m.url && (
            m.url.trim().toLowerCase().startsWith('<html') || 
            m.url.trim().toLowerCase().startsWith('<!doctype') ||
            m.url.trim().toLowerCase().startsWith('<div') ||
            m.url.trim().toLowerCase().startsWith('<script')
          );
          
          return {
            ...m,
            grade,
            type,
            link: isRawHtml ? undefined : m.url,
            htmlContent: isRawHtml ? m.url : undefined
          };
        };

        const worksheets = (Array.isArray(targetData.worksheets) ? targetData.worksheets : (Array.isArray(targetData.phiếu) ? targetData.phiếu : [])).map(m => processModule(m, 'worksheet'));
        const unitTests = (Array.isArray(targetData.unitTests) ? targetData.unitTests : (Array.isArray(targetData.kiểmTra) ? targetData.kiểmTra : [])).map(m => processModule(m, 'unit_test'));
        const mockExams = (Array.isArray(targetData.mockExams) ? targetData.mockExams : (Array.isArray(targetData.đềThi) ? targetData.đềThi : [])).map(m => processModule(m, 'mock_exam'));
        const games = (Array.isArray(targetData.games) ? targetData.games : (Array.isArray(targetData.tròChơi) ? targetData.tròChơi : [])).map(m => processModule(m, 'game'));

        // Only overwrite if we actually got some items, otherwise keep the default/sample
        if (worksheets.length > 0 || unitTests.length > 0 || mockExams.length > 0 || games.length > 0) {
          result.grades[grade] = {
            worksheets,
            unitTests,
            mockExams,
            games
          };
        }

        // Fallback: If it's just a raw list of modules, group them
        if (Array.isArray(d) && d.length > 0) {
          const modules = d as ContentModule[];
          result.grades[grade] = {
            worksheets: modules.filter(m => String(m.type).toLowerCase().includes('worksheet') || String(m.type).toLowerCase().includes('phiếu')),
            unitTests: modules.filter(m => String(m.type).toLowerCase().includes('unit_test') || String(m.type).toLowerCase().includes('kiểm tra')),
            mockExams: modules.filter(m => String(m.type).toLowerCase().includes('mock_exam') || String(m.type).toLowerCase().includes('đề thi')),
            games: modules.filter(m => String(m.type).toLowerCase().includes('game'))
          };
        }
      }
    } catch (error) {
      console.error(`Error fetching Grade ${grade} from ${url}:`, error);
    }
  });

  await Promise.all(fetchPromises);
  
  return result;
};

function emptyGradeData(grade: Grade) {
  return {
    worksheets: [],
    unitTests: [],
    mockExams: [],
    games: []
  };
}
