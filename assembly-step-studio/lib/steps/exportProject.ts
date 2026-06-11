import type { AssemblyProject } from '@/types/assembly';

export function downloadProjectJSON(project: AssemblyProject) {
  const json = JSON.stringify(project, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${project.projectName.replace(/\s+/g, '_')}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function readProjectJSON(file: File): Promise<AssemblyProject> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const project = JSON.parse(reader.result as string) as AssemblyProject;
        if (!project.version || !project.disassemblySteps) {
          throw new Error('Invalid project file');
        }
        resolve(project);
      } catch {
        reject(new Error('Failed to parse project file'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}
