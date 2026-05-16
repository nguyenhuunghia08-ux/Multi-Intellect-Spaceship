export type Grade = 1 | 2 | 3 | 4 | 5;

export type ModuleType = 'worksheet' | 'unit_test' | 'mock_exam' | 'game';

export interface Question {
  id: string;
  question: string;
  options: string[];
  correctAnswer: number; // index of options
  image?: string;
  explanation?: string;
}

export interface ContentModule {
  id: string;
  grade: Grade;
  type: ModuleType;
  title: string;
  description: string;
  questions?: Question[];
  gameData?: any;
  link?: string;
  htmlContent?: string;
}

export interface ContentData {
  grades: {
    [key in Grade]: {
      worksheets: ContentModule[];
      unitTests: ContentModule[];
      mockExams: ContentModule[];
      games: ContentModule[];
    }
  }
}
