/** Public surface of the projects feature. */
export { CreateProjectDialog } from "./components/create-project-dialog";
export { ProjectCard, ProjectGrid } from "./components/project-card";
export {
  catalogueHref,
  ProjectCatalogue,
} from "./components/project-catalogue";
export { ProjectSearch } from "./components/project-search";
export {
  useCatalogue,
  useCreateProject,
  useCreateVersion,
  useProjectDetail,
  useProjectStats,
  useToggleStar,
  useTopProjects,
  useUserProjects,
} from "./hooks/use-projects";
export { projectKeys, recordWatch } from "./api/projects-api";
