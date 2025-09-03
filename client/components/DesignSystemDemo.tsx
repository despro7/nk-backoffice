// Helper to display a color palette
const ColorPalette = ({ title, colors, tailwindClasses }) => (
  <div className="space-y-4">
    <h3 className="text-lg font-medium text-primary">{title}</h3>
    <div className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2">
      {Object.entries(colors).map(([key, value]) => (
        <div key={key} className="space-y-2 text-center">
          <div
            className="w-full h-12 rounded-md border border-neutral-200"
            style={{ backgroundColor: value as string }}
          ></div>
          <p className="text-xs text-neutral-600">{key}</p>
          {tailwindClasses[key] && (
            <p className="text-xs text-neutral-500 font-mono">{tailwindClasses[key]}</p>
          )}
        </div>
      ))}
    </div>
  </div>
);

// Helper to display spacing with Tailwind classes
const SpacingDemo = ({ spacing, tailwindClasses }) => (
  <div className="space-y-3">
    {Object.entries(spacing).map(([key, value]) => (
      <div key={key} className="flex items-center gap-4">
        <div
          className="bg-primary rounded"
          style={{ width: value as string, height: '24px' }}
        ></div>
        <span className="text-sm text-neutral-600">{`${key} - ${value}`}</span>
        {tailwindClasses[key] && (
          <span className="text-xs text-neutral-500 font-mono bg-neutral-100 px-2 py-1 rounded">
            {tailwindClasses[key]}
          </span>
        )}
      </div>
    ))}
  </div>
);

// Helper to display border radius with Tailwind classes
const BorderRadiusDemo = ({ borderRadius, tailwindClasses }) => (
  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 items-center">
    {Object.entries(borderRadius).map(([key, value]) => (
      <div key={key} className="space-y-2">
        <div
          className="w-24 h-24 bg-neutral-200 border border-neutral-300 flex items-center justify-center"
          style={{ borderRadius: value as string }}
        >
           <span className="text-sm text-neutral-600">{key}</span>
        </div>
        {tailwindClasses[key] && (
          <p className="text-xs text-center text-neutral-500 font-mono bg-neutral-100 px-2 py-1 rounded">
            {tailwindClasses[key]}
          </p>
        )}
      </div>
    ))}
  </div>
);

export function DesignSystemDemo() {
  // Определяем цвета напрямую из CSS переменных
  const colors = {
    neutral: {
      "50": "#f9fafb",
      "100": "#f3f4f6", 
      "200": "#e5e7eb",
      "300": "#d1d5db",
      "400": "#9ca3af",
      "500": "#6b7280",
      "600": "#4b5563",
      "700": "#374151",
      "800": "#1f2937",
      "900": "#111827"
    },
    grey: {
      "50": "#f6f6f6",
      "100": "#f0f0f0",
      "200": "#e5e5e5",
      "400": "#d2d2d2",
      "500": "#acacac",
      "600": "#6f6f6f",
      "700": "#555555",
      "800": "#444444"
    },
    danger: {
      "400": "#eb5541",
      "500": "#e3484b",
      "700": "#da291c"
    },
    success: {
      "100": "#e9f2e0",
      "200": "#bfef90",
      "500": "#5bb434",
      "600": "#409b18",
      "700": "#5e8f2d"
    },
    warning: {
      "400": "#ffebad",
      "500": "#ebcb69",
      "700": "#dbab19"
    }
  };

  // Tailwind классы для цветов
  const colorTailwindClasses = {
    neutral: {
      "50": "bg-neutral-50",
      "100": "bg-neutral-100",
      "200": "bg-neutral-200",
      "300": "bg-neutral-300",
      "400": "bg-neutral-400",
      "500": "bg-neutral-500",
      "600": "bg-neutral-600",
      "700": "bg-neutral-700",
      "800": "bg-neutral-800",
      "900": "bg-neutral-900"
    },
    grey: {
      "50": "bg-grey-50",
      "100": "bg-grey-100",
      "200": "bg-grey-200",
      "400": "bg-grey-400",
      "500": "bg-grey-500",
      "600": "bg-grey-600",
      "700": "bg-grey-700",
      "800": "bg-grey-800"
    },
    danger: {
      "400": "bg-danger-400",
      "500": "bg-danger-500",
      "700": "bg-danger-700"
    },
    success: {
      "100": "bg-success-100",
      "200": "bg-success-200",
      "500": "bg-success-500",
      "600": "bg-success-600",
      "700": "bg-success-700"
    },
    warning: {
      "400": "bg-warning-400",
      "500": "bg-warning-500",
      "700": "bg-warning-700"
    }
  };

  // Определяем типографику
  const typography = {
    h1: {
      fontSize: "32px",
      fontFamily: "Inter",
      fontWeight: 600,
      letterSpacing: "-0.64px",
      lineHeight: "32px"
    },
    h2: {
      fontSize: "26px",
      fontFamily: "Inter", 
      fontWeight: 600,
      letterSpacing: "-0.52px",
      lineHeight: "26px"
    },
    body: {
      fontSize: "16px",
      fontFamily: "Inter",
      fontWeight: 400,
      lineHeight: "130%"
    },
    caption: {
      fontSize: "13px",
      fontFamily: "Inter",
      fontWeight: 500,
      lineHeight: "110%",
      letterSpacing: "-0.143px"
    }
  };

  // Tailwind классы для типографики
  const typographyTailwindClasses = {
    h1: "text-3xl font-semibold font-inter tracking-[-0.64px] leading-8",
    h2: "text-2xl font-semibold font-inter tracking-[-0.52px] leading-7",
    body: "text-base font-normal font-inter leading-[130%]",
    caption: "text-sm font-medium font-inter leading-[110%] tracking-[-0.143px]"
  };

  // Определяем spacing (используем нативные Tailwind)
  const spacing = {
    "xs": "8px",    // p-2
    "sm": "12px",   // p-3
    "md": "16px",   // p-4
    "lg": "20px",   // p-5
    "xl": "24px",   // p-6
    "2xl": "32px",  // p-8
    "3xl": "40px",  // p-10
    "4xl": "48px",  // p-12
    "5xl": "64px"   // p-16
  };

  // Tailwind классы для spacing
  const spacingTailwindClasses = {
    "xs": "p-2, m-2, gap-2, space-x-2",
    "sm": "p-3, m-3, gap-3, space-x-3",
    "md": "p-4, m-4, gap-4, space-x-4",
    "lg": "p-5, m-5, gap-5, space-x-5",
    "xl": "p-6, m-6, gap-6, space-x-6",
    "2xl": "p-8, m-8, gap-8, space-x-8",
    "3xl": "p-10, m-10, gap-10, space-x-10",
    "4xl": "p-12, m-12, gap-12, space-x-12",
    "5xl": "p-16, m-16, gap-16, space-x-16"
  };

  // Определяем border radius (все значения из global.css)
  const borderRadius = {
    "sm": "6px",
    "md": "10px", 
    "lg": "16px",
    "xl": "20px",
    "2xl": "32px",
    "3xl": "40px",
    "4xl": "48px",
    "5xl": "64px"
  };

  // Tailwind классы для border radius
  const borderRadiusTailwindClasses = {
    "sm": "rounded-sm",
    "md": "rounded-md",
    "lg": "rounded-lg",
    "xl": "rounded-xl",
    "2xl": "rounded-2xl",
    "3xl": "rounded-3xl",
    "4xl": "rounded-4xl",
    "5xl": "rounded-5xl"
  };

  // Определяем shadows (все значения из global.css)
  const shadows = {
    container: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
    inner: "inset 0 8px 8px 0 rgba(0, 0, 0, 0.04)",
    "inner-sm": "inset 0 1px 3px 0 rgba(55, 65, 81, 0.1)",
    "button-primary": "0 12px 15px -10px rgba(55, 65, 81, 0.5)",
    "button-danger": "0 12px 15px -10px rgba(227, 72, 75, 0.5)"
  };

  // Tailwind классы для shadows
  const shadowTailwindClasses = {
    container: "shadow-container",
    inner: "shadow-inner",
    "inner-sm": "shadow-inner-sm",
    "button-primary": "shadow-button-primary",
    "button-danger": "shadow-button-danger"
  };

  return (
    <div className="p-6 space-y-8 bg-background-paper rounded-lg shadow-container">
      
      {/* Main Colors */}
      <div className="space-y-4">
        <h3 className="text-xl font-semibold text-primary">Main Colors</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="space-y-2">
            <div className="w-full h-16 bg-primary rounded-lg"></div>
            <p className="text-center text-sm text-neutral-600">Primary</p>
            <p className="text-center text-xs text-neutral-500 font-mono">bg-primary</p>
          </div>
          <div className="space-y-2">
            <div className="w-full h-16 bg-secondary rounded-lg"></div>
            <p className="text-center text-sm text-neutral-600">Secondary</p>
            <p className="text-center text-xs text-neutral-500 font-mono">bg-secondary</p>
          </div>
          <div className="space-y-2">
            <div className="w-full h-16 bg-danger rounded-lg"></div>
            <p className="text-center text-sm text-neutral-600">Danger</p>
            <p className="text-center text-xs text-neutral-500 font-mono">bg-danger</p>
          </div>
           <div className="space-y-2">
            <div className="w-full h-16 bg-success-500 rounded-lg"></div>
            <p className="text-center text-sm text-neutral-600">Success</p>
            <p className="text-center text-xs text-neutral-500 font-mono">bg-success-500</p>
          </div>
          <div className="space-y-2">
            <div className="w-full h-16 bg-warning-500 rounded-lg"></div>
            <p className="text-center text-sm text-neutral-600">Warning</p>
            <p className="text-center text-xs text-neutral-500 font-mono">bg-warning-500</p>
          </div>
        </div>
      </div>
      
      {/* Color Palettes */}
      <ColorPalette title="Neutral" colors={colors.neutral} tailwindClasses={colorTailwindClasses.neutral} />
      <ColorPalette title="Grey" colors={colors.grey} tailwindClasses={colorTailwindClasses.grey} />
      <ColorPalette title="Danger" colors={colors.danger} tailwindClasses={colorTailwindClasses.danger} />
      <ColorPalette title="Success" colors={colors.success} tailwindClasses={colorTailwindClasses.success} />
      <ColorPalette title="Warning" colors={colors.warning} tailwindClasses={colorTailwindClasses.warning} />

      {/* Typography */}
      <div className="space-y-4">
        <h3 className="text-xl font-semibold text-primary">Typography</h3>
        <div className="space-y-4 p-4 border border-neutral-200 rounded-lg">
          <div style={typography.h1}>
            H1 - Заголовок 1 рівня
          </div>
          <p className="text-xs text-neutral-500 font-mono bg-neutral-100 px-2 py-1 rounded inline-block">
            {typographyTailwindClasses.h1}
          </p>
          
          <div style={typography.h2}>
            H2 - Заголовок 2 рівня
          </div>
          <p className="text-xs text-neutral-500 font-mono bg-neutral-100 px-2 py-1 rounded inline-block">
            {typographyTailwindClasses.h2}
          </p>
          
          <div style={typography.body}>
            Body - Основний текст для контенту. Lorem ipsum dolor sit amet...
          </div>
          <p className="text-xs text-neutral-500 font-mono bg-neutral-100 px-2 py-1 rounded inline-block">
            {typographyTailwindClasses.body}
          </p>
          
          <div style={typography.caption}>
            Caption - Підписи та допоміжний текст
          </div>
          <p className="text-xs text-neutral-500 font-mono bg-neutral-100 px-2 py-1 rounded inline-block">
            {typographyTailwindClasses.caption}
          </p>
        </div>
      </div>

      {/* Spacing */}
      <div className="space-y-4">
        <h3 className="text-xl font-semibold text-primary">Spacing</h3>
        <SpacingDemo spacing={spacing} tailwindClasses={spacingTailwindClasses} />
      </div>

      {/* Border Radius */}
      <div className="space-y-4">
        <h3 className="text-xl font-semibold text-primary">Border Radius</h3>
        <BorderRadiusDemo borderRadius={borderRadius} tailwindClasses={borderRadiusTailwindClasses} />
      </div>
      
      {/* Shadows */}
      <div className="space-y-4">
        <h3 className="text-xl font-semibold text-primary">Shadows</h3>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6 p-4">
          {/* button-primary */}
          <div className="flex flex-col items-center space-y-2">
            <div className="w-full h-24 bg-primary rounded-lg flex flex-col items-center justify-center" style={{ boxShadow: shadows["button-primary"] }}>
              <p className="text-sm text-white">button-primary</p>
              <p className="text-xs text-center text-white/90 font-mono px-2 py-1 rounded">
                {shadowTailwindClasses["button-primary"]}
              </p>
            </div>
          </div>
          {/* button-danger */}
          <div className="flex flex-col items-center space-y-2">
            <div className="w-full h-24 bg-danger rounded-lg flex flex-col items-center justify-center" style={{ boxShadow: shadows["button-danger"] }}>
              <p className="text-sm text-danger-foreground">button-danger</p>
              <p className="text-xs text-center text-white/90 font-mono px-2 py-1 rounded">
                {shadowTailwindClasses["button-danger"]}
              </p>
            </div>
          </div>
          {/* container */}
          <div className="flex flex-col items-center space-y-2">
            <div className="w-full h-24 bg-white rounded-lg flex flex-col items-center justify-center" style={{ boxShadow: shadows.container }}>
              <p className="text-sm text-neutral-600">container</p>
              <p className="text-xs text-center text-neutral-500 font-mono bg-neutral-100 px-2 py-1 rounded">
                {shadowTailwindClasses.container}
              </p>
            </div>
          </div>
          {/* inner */}
          <div className="flex flex-col items-center space-y-2">
            <div className="w-full h-24 bg-neutral-100 rounded-lg flex flex-col items-center justify-center" style={{ boxShadow: shadows.inner }}>
              <p className="text-sm text-neutral-600">inner</p>
              <p className="text-xs text-center text-neutral-500 font-mono bg-neutral-100 px-2 py-1 rounded">
                {shadowTailwindClasses.inner}
              </p>
            </div>
          </div>
          {/* inner-sm */}
          <div className="flex flex-col items-center space-y-2">
            <div className="w-full h-24 bg-white rounded-lg flex flex-col items-center justify-center" style={{ boxShadow: shadows["inner-sm"] }}>
              <p className="text-sm text-neutral-600">inner-sm</p>
              <p className="text-xs text-center text-neutral-500 font-mono bg-neutral-100 px-2 py-1 rounded">
                {shadowTailwindClasses["inner-sm"]}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Fonts */}
      <div className="space-y-4">
        <h3 className="text-xl font-semibold text-primary">Fonts</h3>
        <div className="space-y-4 p-4 border border-neutral-200 rounded-lg">
          <div className="font-inter text-lg">
            Inter - Основной шрифт для интерфейса
          </div>
          <p className="text-xs text-neutral-500 font-mono bg-neutral-100 px-2 py-1 rounded">
            font-inter
          </p>
        </div>
      </div>
    </div>
  );
}