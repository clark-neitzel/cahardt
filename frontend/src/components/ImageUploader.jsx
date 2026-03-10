import React, { useCallback, useState } from 'react';
import { UploadCloud, X } from 'lucide-react';

const ImageUploader = ({ onUpload }) => {
    const [dragActive, setDragActive] = useState(false);
    const [files, setFiles] = useState([]);

    const handleDrag = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === 'dragenter' || e.type === 'dragover') {
            setDragActive(true);
        } else if (e.type === 'dragleave') {
            setDragActive(false);
        }
    }, []);

    const handleDrop = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            const newFiles = Array.from(e.dataTransfer.files);
            setFiles(prev => [...prev, ...newFiles]);
        }
    }, []);

    const handleChange = (e) => {
        e.preventDefault();
        if (e.target.files && e.target.files[0]) {
            const newFiles = Array.from(e.target.files);
            setFiles(prev => [...prev, ...newFiles]);
        }
    };

    const removeFile = (idx) => {
        setFiles(prev => prev.filter((_, i) => i !== idx));
    };

    const handleSubmit = async () => {
        if (files.length === 0) return;

        const formData = new FormData();
        files.forEach(file => {
            formData.append('foto', file);
        });

        await onUpload(formData);
        setFiles([]); // Limpa após upload
    };

    return (
        <div className="w-full">
            <div
                className={`relative border-2 border-dashed rounded-lg p-6 text-center ${dragActive ? 'border-primary bg-blue-50' : 'border-gray-300 bg-gray-50'
                    }`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
            >
                <input
                    type="file"
                    multiple
                    className="hidden"
                    id="image-upload"
                    onChange={handleChange}
                    accept="image/*"
                />
                <label htmlFor="image-upload" className="cursor-pointer flex flex-col items-center">
                    <UploadCloud className="h-10 w-10 text-gray-400 mb-2" />
                    <span className="text-sm text-gray-600 font-medium">
                        Arraste imagens ou clique para selecionar
                    </span>
                    <span className="text-xs text-gray-500 mt-1">
                        PNG, JPG, WEBP (Max 5MB)
                    </span>
                </label>
            </div>

            {files.length > 0 && (
                <div className="mt-4">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Arquivos selecionados:</h4>
                    <ul className="space-y-2">
                        {files.map((file, idx) => (
                            <li key={idx} className="flex justify-between items-center bg-white p-2 rounded border border-gray-200 text-sm">
                                <span className="truncate">{file.name}</span>
                                <button onClick={() => removeFile(idx)} className="text-red-500 hover:text-red-700">
                                    <X className="h-4 w-4" />
                                </button>
                            </li>
                        ))}
                    </ul>
                    <button
                        onClick={handleSubmit}
                        className="mt-4 w-full bg-primary text-white py-2 rounded-md hover:bg-blue-700 transition"
                    >
                        Enviar {files.length} Imagens
                    </button>
                </div>
            )}
        </div>
    );
};

export default ImageUploader;
