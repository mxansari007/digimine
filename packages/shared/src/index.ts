/**
 * @digimine/shared — cross-app feature components and Firestore helpers.
 *
 * Anything added under src/ must be exported through this barrel so the
 * package surface stays explicit. See README.md for placement rules.
 */

export { uploadFile, type UploadProgress } from "./firebase/storage";
export { FileUpload } from "./components/FileUpload";
export { QuizForm, type QuizFormProps } from "./components/builders/QuizForm";
export { RichTextEditor, type RichTextEditorProps } from "./components/RichTextEditor";
export { ContestForm, type ContestFormProps } from "./components/builders/ContestForm";
export { CourseForm, type CourseFormProps } from "./components/builders/CourseForm";
export { TestSeriesForm, type TestSeriesFormProps } from "./components/builders/TestSeriesForm";
