import React from 'react';
import { QueryEditorProps } from '@grafana/data';
import { MyQuery } from '../types';
import { Input, Field } from '@grafana/ui';

interface Props extends QueryEditorProps<any, MyQuery> {}

export const QueryEditor: React.FC<Props> = ({ query, onChange }) => {
  return (
    <div className="gf-form">
      <Field label="Target">
        <Input
          value={query.target || ''}
          onChange={(e) => onChange({ ...query, target: e.currentTarget.value })}
          placeholder="Enter Graphite query (e.g., sumSeries(server*.cpu_usage))"
        />
      </Field>
    </div>
  );
};
