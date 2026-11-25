declare module 'layerchart/daisyui-5.css'
declare module '*.css' {}
declare module '*.css?inline' {
  const css: string
  export default css
}
