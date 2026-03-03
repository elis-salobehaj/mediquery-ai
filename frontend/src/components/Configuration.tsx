import React from 'react';

interface ConfigurationProps {
  apiKey: string;
  setApiKey: (key: string) => void;
}

const Configuration: React.FC<ConfigurationProps> = ({ apiKey, setApiKey }) => {
  return (
    <div className="flex flex-1 items-center justify-center bg-linear-to-br from-slate-900 to-slate-800 p-8">
      <div className="glass-panel w-full max-w-md rounded-2xl p-8">
        <h2 className="mb-4 bg-linear-to-r from-cyan-400 to-blue-500 bg-clip-text text-2xl font-bold text-transparent">
          Configuration
        </h2>
        <p className="mb-6 text-slate-400">
          To use the AI Agent, please provide your Google Gemini API Key.
        </p>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-300">
              Gemini API Key
            </label>
            <input
              type="password"
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 placeholder-slate-600 transition-all outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400"
              placeholder="AIzaSy..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </div>
          <button
            className="w-full rounded-lg bg-linear-to-r from-cyan-500 to-blue-600 py-3 font-semibold text-white shadow-lg transition-all hover:scale-[1.02] hover:shadow-cyan-500/20"
            onClick={() => alert('Configuration Saved!')}
          >
            Save Configuration
          </button>
        </div>
      </div>
    </div>
  );
};

export default Configuration;
