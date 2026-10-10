/** Stored paths stay portable between hosting origins and repository subpaths. */
export const asset=(path:string)=>path.startsWith('/')?import.meta.env.BASE_URL+path.slice(1):path;
