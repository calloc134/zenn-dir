import { html } from 'hono/html';

interface LayoutProps {
  title: string;
  children: any;
}

export const Layout = ({ title, children }: LayoutProps) => html`
  <!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title}</title>
      <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <body class="bg-gray-50 min-h-screen">
      <div class="container mx-auto px-4 py-8">
        ${children}
      </div>
    </body>
  </html>
`;

interface FormProps {
  action: string;
  method?: string;
  children: any;
  csrfToken?: string;
}

export const Form = ({ action, method = 'POST', children, csrfToken }: FormProps) => html`
  <form action="${action}" method="${method}" class="space-y-4">
    ${csrfToken ? html`<input type="hidden" name="_csrf" value="${csrfToken}">` : ''}
    ${children}
  </form>
`;

interface InputProps {
  name: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
  value?: string;
  label?: string;
}

export const Input = ({ name, type = 'text', placeholder, required, value, label }: InputProps) => html`
  <div>
    ${label ? html`<label for="${name}" class="block text-sm font-medium text-gray-700 mb-1">${label}</label>` : ''}
    <input
      type="${type}"
      name="${name}"
      id="${name}"
      placeholder="${placeholder || ''}"
      ${required ? 'required' : ''}
      value="${value || ''}"
      class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
    >
  </div>
`;

interface ButtonProps {
  type?: string;
  children: any;
  variant?: 'primary' | 'secondary' | 'danger';
}

export const Button = ({ type = 'submit', children, variant = 'primary' }: ButtonProps) => {
  const baseClasses = 'px-4 py-2 font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2';
  const variantClasses = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500',
    secondary: 'bg-gray-600 text-white hover:bg-gray-700 focus:ring-gray-500',
    danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500'
  };
  
  return html`
    <button type="${type}" class="${baseClasses} ${variantClasses[variant]}">
      ${children}
    </button>
  `;
};

interface CardProps {
  title?: string;
  children: any;
}

export const Card = ({ title, children }: CardProps) => html`
  <div class="bg-white shadow rounded-lg">
    ${title ? html`
      <div class="px-6 py-4 border-b border-gray-200">
        <h3 class="text-lg font-medium text-gray-900">${title}</h3>
      </div>
    ` : ''}
    <div class="px-6 py-4">
      ${children}
    </div>
  </div>
`;

interface AlertProps {
  type: 'success' | 'error' | 'warning' | 'info';
  children: any;
}

export const Alert = ({ type, children }: AlertProps) => {
  const typeClasses = {
    success: 'bg-green-50 border-green-200 text-green-800',
    error: 'bg-red-50 border-red-200 text-red-800',
    warning: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    info: 'bg-blue-50 border-blue-200 text-blue-800'
  };
  
  return html`
    <div class="border-l-4 p-4 ${typeClasses[type]}">
      ${children}
    </div>
  `;
};