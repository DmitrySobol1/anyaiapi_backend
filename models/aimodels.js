import mongoose from 'mongoose';

const AiModelsSchema = new mongoose.Schema(
  {
    nameForUser: {
      type: String,
      required: true,
    },
    nameForRequest: {
      type: String,
    },
    ourToken: {
      type: String
    },
  
    //TODO: 
    // ПРОВЕРИТЬ, у всех ли моделей за 1млн токенов и у всех ли компаний
    // в ценах есть есть Cached input, что это? тоже учесть при подсчетах
    // в JSON ответу у GPT есть параметр reasoning_tokens (у output), что это?
   
// Prices per 1M tokens.
    input_token_priceBasicUsd: {
      type: Number
    },
    // Prices per 1M tokens.

    output_token_priceBasicUsd: {
      type: Number
    },
    input_token_priceOurRub: {
      type: Number
    },
    output_token_priceOurRub: {
      type: Number
    },
    path: {
      type: String
    },
    type: {
      type: [String],  // массив типов, например: ['text_to_text', 'text_to_image']
      default: []
    }

    
  },
  {
    timestamps: true,
  }
);

export default mongoose.model('AiModel', AiModelsSchema);

